// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../../persistent/external-positions/maple-liquidity/MapleLiquidityPositionLibBase1.sol";
import "../../../../interfaces/IMaplePool.sol";
import "../../../../interfaces/IMapleMplRewards.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../../utils/AssetHelpers.sol";
import "./IMapleLiquidityPosition.sol";
import "./MapleLiquidityPositionDataDecoder.sol";

/// @title MapleLiquidityPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Maple liquidity positions
contract MapleLiquidityPositionLib is
    IMapleLiquidityPosition,
    MapleLiquidityPositionDataDecoder,
    MapleLiquidityPositionLibBase1,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    uint256 private constant MPT_DECIMALS_FACTOR = 10**18;

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.Lend)) {
            __lendAction(actionArgs);
        } else if (actionId == uint256(Actions.LendAndStake)) {
            __lendAndStakeAction(actionArgs);
        } else if (actionId == uint256(Actions.IntendToRedeem)) {
            __intendToRedeemAction(actionArgs);
        } else if (actionId == uint256(Actions.Redeem)) {
            __redeemAction(actionArgs);
        } else if (actionId == uint256(Actions.Stake)) {
            __stakeAction(actionArgs);
        } else if (actionId == uint256(Actions.Unstake)) {
            __unstakeAction(actionArgs);
        } else if (actionId == uint256(Actions.UnstakeAndRedeem)) {
            __unstakeAndRedeemAction(actionArgs);
        } else if (actionId == uint256(Actions.ClaimInterest)) {
            __claimInterestAction(actionArgs);
        } else if (actionId == uint256(Actions.ClaimRewards)) {
            __claimRewardsAction(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    // @dev Calculates the value of pool tokens referenced in liquidityAsset
    function __calcLiquidityAssetValueOfPoolTokens(
        address _liquidityAsset,
        uint256 _poolTokenAmount
    ) private view returns (uint256 liquidityValue_) {
        uint256 liquidityAssetDecimalsFactor = 10**(uint256(ERC20(_liquidityAsset).decimals()));

        liquidityValue_ = _poolTokenAmount.mul(liquidityAssetDecimalsFactor).div(
            MPT_DECIMALS_FACTOR
        );

        return liquidityValue_;
    }

    /// @dev Claims all interest accrued and send it to the Vault
    function __claimInterestAction(bytes memory _actionArgs) private {
        IMaplePool pool = IMaplePool(__decodeClaimInterestActionArgs(_actionArgs));

        pool.withdrawFunds();

        ERC20 liquidityAssetContract = ERC20(pool.liquidityAsset());

        // Send liquidity asset interest to the vault
        liquidityAssetContract.safeTransfer(
            msg.sender,
            liquidityAssetContract.balanceOf(address(this))
        );
    }

    /// @dev Claims all rewards accrued and send it to the Vault
    function __claimRewardsAction(bytes memory _actionArgs) private {
        address rewardsContract = __decodeClaimRewardsActionArgs(_actionArgs);

        IMapleMplRewards mapleRewards = IMapleMplRewards(rewardsContract);
        ERC20 rewardToken = ERC20(mapleRewards.rewardsToken());
        mapleRewards.getReward();

        rewardToken.safeTransfer(msg.sender, rewardToken.balanceOf(address(this)));
    }

    /// @dev Activates the cooldown period to redeem an asset from a Maple pool
    function __intendToRedeemAction(bytes memory _actionArgs) private {
        address pool = __decodeIntendToRedeemActionArgs(_actionArgs);

        IMaplePool(pool).intendToWithdraw();
    }

    /// @dev Lends assets to a Maple pool
    function __lend(
        address _liquidityAsset,
        address _pool,
        uint256 _liquidityAssetAmount
    ) private {
        __approveAssetMaxAsNeeded(_liquidityAsset, _pool, _liquidityAssetAmount);

        IMaplePool(_pool).deposit(_liquidityAssetAmount);

        if (!isUsedLendingPool(_pool)) {
            usedLendingPools.push(_pool);

            emit UsedLendingPoolAdded(_pool);
        }
    }

    /// @dev Lends assets to a Maple pool (action)
    function __lendAction(bytes memory _actionArgs) private {
        (address pool, uint256 liquidityAssetAmount) = __decodeLendActionArgs(_actionArgs);

        __lend(IMaplePool(pool).liquidityAsset(), pool, liquidityAssetAmount);
    }

    /// @dev Lends assets to a Maple pool, then stakes to a rewardsContract (action)
    function __lendAndStakeAction(bytes memory _actionArgs) private {
        (
            address pool,
            address rewardsContract,
            uint256 liquidityAssetAmount
        ) = __decodeLendAndStakeActionArgs(_actionArgs);
        uint256 poolTokenBalanceBefore = ERC20(pool).balanceOf(address(this));

        __lend(IMaplePool(pool).liquidityAsset(), pool, liquidityAssetAmount);

        uint256 poolTokenBalanceAfter = ERC20(pool).balanceOf(address(this));

        __stake(rewardsContract, pool, poolTokenBalanceAfter.sub(poolTokenBalanceBefore));
    }

    /// @dev Redeems assets from a Maple pool and claims all accrued interest
    function __redeem(address _pool, uint256 _liquidityAssetAmount) private {
        // Also claims all accrued interest
        IMaplePool(_pool).withdraw(_liquidityAssetAmount);

        // If the full amount of pool tokens has been redeemed, it can be removed from usedLendingPools
        if (ERC20(_pool).balanceOf(address(this)) == 0) {
            usedLendingPools.removeStorageItem(_pool);

            emit UsedLendingPoolRemoved(_pool);
        }
    }

    /// @dev Redeems assets from a Maple pool and claims all accrued interest (action)
    function __redeemAction(bytes memory actionArgs) private {
        (address pool, uint256 liquidityAssetAmount) = __decodeRedeemActionArgs(actionArgs);

        __redeem(pool, liquidityAssetAmount);

        address liquidityAsset = IMaplePool(pool).liquidityAsset();

        // Send liquidity asset back to the vault
        ERC20(liquidityAsset).safeTransfer(
            msg.sender,
            ERC20(liquidityAsset).balanceOf(address(this))
        );
    }

    /// @dev Stakes assets to a rewardsContract
    function __stake(
        address _rewardsContract,
        address _pool,
        uint256 _poolTokenAmount
    ) private {
        IMaplePool(_pool).increaseCustodyAllowance(_rewardsContract, _poolTokenAmount);

        IMapleMplRewards(_rewardsContract).stake(_poolTokenAmount);
    }

    /// @dev Decodes actionArgs and calls __stake with args function (action)
    function __stakeAction(bytes memory _actionArgs) private {
        (address rewardsContract, address pool, uint256 poolTokenAmount) = __decodeStakeActionArgs(
            _actionArgs
        );

        __stake(rewardsContract, pool, poolTokenAmount);
    }

    /// @dev Unstakes assets from a rewardsContract
    function __unstake(address _rewardsContract, uint256 _poolTokenAmount) private {
        IMapleMplRewards(_rewardsContract).withdraw(_poolTokenAmount);
    }

    /// @dev Unstakes assets from a rewardsContract (action)
    function __unstakeAction(bytes memory _actionArgs) private {
        (address rewardsContract, uint256 poolTokenAmount) = __decodeUnstakeActionArgs(
            _actionArgs
        );
        __unstake(rewardsContract, poolTokenAmount);
    }

    /// @dev Unstakes assets from a rewardsContract, then redeems assets from a Maple pool and claims all accrued interest (action)
    function __unstakeAndRedeemAction(bytes memory actionArgs) private {
        (
            address pool,
            address rewardsContract,
            uint256 poolTokenAmount
        ) = __decodeUnstakeAndRedeemActionArgs(actionArgs);

        address liquidityAsset = IMaplePool(pool).liquidityAsset();

        __unstake(rewardsContract, poolTokenAmount);
        __redeem(pool, __calcLiquidityAssetValueOfPoolTokens(liquidityAsset, poolTokenAmount));

        // Send liquidity asset back to the vault
        ERC20(liquidityAsset).safeTransfer(
            msg.sender,
            ERC20(liquidityAsset).balanceOf(address(this))
        );
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        uint256 usedLendingPoolsLength = getUsedLendingPools().length;

        assets_ = new address[](usedLendingPoolsLength);
        amounts_ = new uint256[](usedLendingPoolsLength);

        for (uint256 i; i < usedLendingPoolsLength; i++) {
            IMaplePool pool = IMaplePool(usedLendingPools[i]);

            assets_[i] = pool.liquidityAsset();

            // The liquidity asset balance is derived from the pool token balance (which is stored as a wad),
            // while interest and losses are already returned in terms of the liquidity asset (not pool token)
            uint256 liquidityAssetBalance = __calcLiquidityAssetValueOfPoolTokens(
                assets_[i],
                ERC20(usedLendingPools[i]).balanceOf(address(this))
            );

            uint256 accumulatedInterest = pool.withdrawableFundsOf(address(this));
            uint256 accumulatedLosses = pool.recognizableLossesOf(address(this));

            amounts_[i] = liquidityAssetBalance.add(accumulatedInterest).sub(accumulatedLosses);
        }

        // If more than 1 pool position, combine amounts of the same asset.
        // We can remove this if/when we aggregate asset amounts at the ComptrollerLib level.
        if (usedLendingPoolsLength > 1) {
            (assets_, amounts_) = __aggregateAssetAmounts(assets_, amounts_);
        }

        return (assets_, amounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets all pools currently lent to
    /// @return pools_ The pools currently lent to
    function getUsedLendingPools() public view returns (address[] memory pools_) {
        return usedLendingPools;
    }

    /// @notice Checks whether a pool is currently lent to
    /// @param _pool The pool
    /// @return isUsed_ True if the pool is lent to
    function isUsedLendingPool(address _pool) public view returns (bool isUsed_) {
        return usedLendingPools.contains(_pool);
    }
}
