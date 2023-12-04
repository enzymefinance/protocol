// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {SafeMath} from "openzeppelin-solc-0.6/math/SafeMath.sol";
import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {IMapleV2Pool} from "../../../../../external-interfaces/IMapleV2Pool.sol";
import {IMapleV2PoolManager} from "../../../../../external-interfaces/IMapleV2PoolManager.sol";
import {IMapleV2WithdrawalManager} from "../../../../../external-interfaces/IMapleV2WithdrawalManager.sol";
import {AddressArrayLib} from "../../../../../utils/0.6.12/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.6.12/AssetHelpers.sol";
import {MapleLiquidityPositionLibBase2} from "./bases/MapleLiquidityPositionLibBase2.sol";
import {IMapleLiquidityPosition} from "./IMapleLiquidityPosition.sol";
import {MapleLiquidityPositionDataDecoder} from "./MapleLiquidityPositionDataDecoder.sol";

/// @title MapleLiquidityPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Maple liquidity positions
contract MapleLiquidityPositionLib is
    IMapleLiquidityPosition,
    MapleLiquidityPositionDataDecoder,
    MapleLiquidityPositionLibBase2,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeMath for uint256;

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.LendV2)) {
            __lendV2Action(actionArgs);
        } else if (actionId == uint256(Actions.RequestRedeemV2)) {
            __requestRedeemV2Action(actionArgs);
        } else if (actionId == uint256(Actions.RedeemV2)) {
            __redeemV2Action(actionArgs);
        } else if (actionId == uint256(Actions.CancelRedeemV2)) {
            __cancelRedeemV2Action(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /////////////
    // ACTIONS //
    /////////////

    /// @dev Helper to add a Maple v2 pool used by the position
    function __addUsedPoolV2IfUntracked(address _pool) private {
        if (!isUsedLendingPoolV2(_pool)) {
            usedLendingPoolsV2.push(_pool);

            emit UsedLendingPoolV2Added(_pool);
        }
    }

    /// @dev Cancels redemption request from a Maple V2 pool by removing shares from escrow (action)
    function __cancelRedeemV2Action(bytes memory _actionArgs) private {
        (address pool, uint256 poolTokenAmount) = __decodeCancelRedeemV2ActionArgs(_actionArgs);

        IMapleV2Pool(pool).removeShares({_shares: poolTokenAmount, _owner: address(this)});
    }

    /// @dev Lends assets to a Maple V2 pool (action)
    function __lendV2Action(bytes memory _actionArgs) private {
        (address pool, uint256 liquidityAssetAmount) = __decodeLendV2ActionArgs(_actionArgs);

        __approveAssetMaxAsNeeded({
            _asset: IMapleV2Pool(pool).asset(),
            _target: pool,
            _neededAmount: liquidityAssetAmount
        });

        IMapleV2Pool(pool).deposit({_assets: liquidityAssetAmount, _receiver: address(this)});

        __addUsedPoolV2IfUntracked(pool);
    }

    /// @dev Redeems assets from a Maple V2 pool (action)
    function __redeemV2Action(bytes memory _actionArgs) private {
        (address pool, uint256 poolTokenAmount) = __decodeRedeemV2ActionArgs(_actionArgs);

        IMapleV2Pool(pool).redeem({_shares: poolTokenAmount, _receiver: msg.sender, _owner: address(this)});

        // If the full amount of pool tokens has been redeemed, it can be removed from usedLendingPoolsV2
        if (__getTotalPoolTokenV2Balance(pool) == 0) {
            usedLendingPoolsV2.removeStorageItem(pool);

            emit UsedLendingPoolV2Removed(pool);
        }
    }

    /// @dev Request to Redeem assets from a Maple V2 pool (action)
    function __requestRedeemV2Action(bytes memory _actionArgs) private {
        (address pool, uint256 poolTokenAmount) = __decodeRequestRedeemV2ActionArgs(_actionArgs);

        IMapleV2Pool(pool).requestRedeem({_shares: poolTokenAmount, _owner: address(this)});
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        address[] memory poolsV2 = getUsedLendingPoolsV2();
        uint256 poolsV2Length = poolsV2.length;
        assets_ = new address[](poolsV2Length);
        amounts_ = new uint256[](poolsV2Length);
        for (uint256 i; i < poolsV2Length; i++) {
            address poolV2 = poolsV2[i];

            assets_[i] = IMapleV2Pool(poolV2).asset();
            amounts_[i] = IMapleV2Pool(poolV2).convertToExitAssets(__getTotalPoolTokenV2Balance(poolV2));
        }

        // If more than 1 pool position, combine amounts of the same asset.
        // We can remove this if/when we aggregate asset amounts at the ComptrollerLib level.
        if (assets_.length > 1) {
            (assets_, amounts_) = __aggregateAssetAmounts(assets_, amounts_);
        }

        return (assets_, amounts_);
    }

    /// @dev Helper to get total pool token v2 balance, including escrowed amount
    function __getTotalPoolTokenV2Balance(address _pool) private view returns (uint256 balance_) {
        balance_ = ERC20(_pool).balanceOf(address(this));

        // According to Maple's WithdrawalManager code comments, IMapleV2PoolManager.withdrawalManager
        // can be set to address(0) in order to pause redemptions, which would cause this to revert.
        address withdrawalManager = IMapleV2PoolManager(IMapleV2Pool(_pool).manager()).withdrawalManager();

        return balance_.add(IMapleV2WithdrawalManager(withdrawalManager).lockedShares(address(this)));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets all Maple V2 pools currently lent to
    /// @return poolsV2_ The Maple V2 pools currently lent to
    function getUsedLendingPoolsV2() public view returns (address[] memory poolsV2_) {
        return usedLendingPoolsV2;
    }

    /// @notice Checks whether a pool V2 is currently lent to
    /// @param _poolV2 The pool
    /// @return isUsed_ True if the pool is lent to
    function isUsedLendingPoolV2(address _poolV2) public view returns (bool isUsed_) {
        return usedLendingPoolsV2.storageArrayContains(_poolV2);
    }
}
