// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import "../../../../../persistent/external-positions/maple-liquidity/MapleLiquidityPositionLibBase2.sol";
import "../../../../../persistent/external-positions/maple-liquidity/MapleV1ToV2PoolMapper.sol";
import "../../../../../external-interfaces/IMapleV1MplRewards.sol";
import "../../../../../external-interfaces/IMapleV1Pool.sol";
import "../../../../../external-interfaces/IMapleV2Pool.sol";
import "../../../../../external-interfaces/IMapleV2PoolManager.sol";
import "../../../../../external-interfaces/IMapleV2WithdrawalManager.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../../utils/AssetHelpers.sol";
import "../../../../utils/Uint256ArrayLib.sol";
import "./IMapleLiquidityPosition.sol";
import "./MapleLiquidityPositionDataDecoder.sol";

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
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using Uint256ArrayLib for uint256[];

    uint256 private constant MPT_V1_DECIMALS_FACTOR = 10**18;

    MapleV1ToV2PoolMapper private immutable MAPLE_V1_TO_V2_POOL_MAPPER_CONTRACT;

    constructor(address _mapleV1ToV2PoolMapper) public {
        MAPLE_V1_TO_V2_POOL_MAPPER_CONTRACT = MapleV1ToV2PoolMapper(_mapleV1ToV2PoolMapper);
    }

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
        } else if (actionId == uint256(Actions.ClaimRewardsV1)) {
            __claimRewardsV1Action(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    ////////////////
    // V1 ACTIONS //
    ////////////////

    /// @dev Claims all rewards accrued and send it to the Vault
    function __claimRewardsV1Action(bytes memory _actionArgs) private {
        address rewardsContract = __decodeClaimRewardsV1ActionArgs(_actionArgs);

        IMapleV1MplRewards mapleRewards = IMapleV1MplRewards(rewardsContract);
        ERC20 rewardToken = ERC20(mapleRewards.rewardsToken());
        mapleRewards.getReward();

        rewardToken.safeTransfer(msg.sender, rewardToken.balanceOf(address(this)));
    }

    ////////////////
    // V2 ACTIONS //
    ////////////////

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
        // v1 pools must all be migrated before lending is allowed,
        // otherwise a situation could arise where airdropped MPTv2 are double-counted
        // since their corresponding v1 snapshot balance is still included in position value.
        if (usedLendingPoolsV1.length > 0) {
            migratePoolsV1ToV2();
        }

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

        IMapleV2Pool(pool).redeem({
            _shares: poolTokenAmount,
            _receiver: msg.sender,
            _owner: address(this)
        });

        // If the full amount of pool tokens has been redeemed, it can be removed from usedLendingPoolsV2
        if (__getTotalPoolTokenV2Balance(pool) == 0) {
            usedLendingPoolsV2.removeStorageItem(pool);

            emit UsedLendingPoolV2Removed(pool);
        }
    }

    /// @dev Request to Redeem assets from a Maple V2 pool (action)
    function __requestRedeemV2Action(bytes memory _actionArgs) private {
        // v1 pools must all be migrated before any redemptions are made,
        // otherwise a situation could arise where airdropped MPTv2 are redeemed
        // while their corresponding v1 snapshot balance is still included in position value.
        if (usedLendingPoolsV1.length > 0) {
            migratePoolsV1ToV2();
        }

        (address pool, uint256 poolTokenAmount) = __decodeRequestRedeemV2ActionArgs(_actionArgs);

        IMapleV2Pool(pool).requestRedeem({_shares: poolTokenAmount, _owner: address(this)});
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
    /// @dev Since lending is not allowed until all v1 pools are migrated,
    /// tracked pools will either be all v1 or all v2, never a mix
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        uint256 poolsV1Length = usedLendingPoolsV1.length;
        if (poolsV1Length > 0) {
            if (MAPLE_V1_TO_V2_POOL_MAPPER_CONTRACT.migrationIsAllowed()) {
                // Once v1 => v2 migration is allowed, require it
                migratePoolsV1ToV2();

                // If migration does not revert, there are no more v1 pools
                poolsV1Length = 0;
            } else {
                // All pools are v1

                // If snapshots are still allowed, update all snapshots
                try this.snapshotPoolTokenV1BalanceValues() {} catch {}

                address[] memory poolsV1 = getUsedLendingPoolsV1();
                assets_ = new address[](poolsV1Length);
                amounts_ = new uint256[](poolsV1Length);
                for (uint256 i; i < poolsV1Length; i++) {
                    address poolV1 = poolsV1[i];

                    // Require there to be a snapshotted pool token v1 value,
                    // as we either have a snapshot at this point or no further snapshots are allowed
                    uint256 amount = getPreMigrationValueSnapshotOfPoolTokenV1(poolV1);
                    require(amount > 0, "getManagedAssets: No pool v1 snapshot");

                    assets_[i] = IMapleV1Pool(poolV1).liquidityAsset();
                    amounts_[i] = amount;
                }
            }
        }

        if (poolsV1Length == 0) {
            // All pools are v2
            address[] memory poolsV2 = getUsedLendingPoolsV2();
            uint256 poolsV2Length = poolsV2.length;
            assets_ = new address[](poolsV2Length);
            amounts_ = new uint256[](poolsV2Length);
            for (uint256 i; i < poolsV2Length; i++) {
                address poolV2 = poolsV2[i];

                assets_[i] = IMapleV2Pool(poolV2).asset();
                amounts_[i] = IMapleV2Pool(poolV2).convertToExitAssets(
                    __getTotalPoolTokenV2Balance(poolV2)
                );
            }
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
        balance_ = IERC20(_pool).balanceOf(address(this));

        // According to Maple's WithdrawalManager code comments, IMapleV2PoolManager.withdrawalManager
        // can be set to address(0) in order to pause redemptions, which would cause this to revert.
        address withdrawalManager = IMapleV2PoolManager(IMapleV2Pool(_pool).manager())
            .withdrawalManager();

        return
            balance_.add(IMapleV2WithdrawalManager(withdrawalManager).lockedShares(address(this)));
    }

    ////////////////////////
    // V1-TO-V2 MIGRATION //
    ////////////////////////

    // @dev We can remove all of these post-migration in a future version

    // EXTERNAL FUNCTIONS

    /// @notice Creates a snapshot of all Maple Pool Token v1 balance values
    /// @dev Callable by anybody
    function snapshotPoolTokenV1BalanceValues() external {
        require(
            MAPLE_V1_TO_V2_POOL_MAPPER_CONTRACT.snapshotsAreAllowed(),
            "snapshotPoolTokenV1BalanceValues: Snapshots frozen"
        );

        address[] memory poolsV1 = getUsedLendingPoolsV1();
        uint256 poolsV1Length = poolsV1.length;
        for (uint256 i; i < poolsV1Length; i++) {
            address poolV1 = poolsV1[i];
            uint256 value = __calcPoolV1TokenBalanceValue(poolV1);

            poolTokenV1ToPreMigrationValueSnapshot[poolV1] = value;

            emit PoolTokenV1PreMigrationValueSnapshotted(poolV1, value);
        }
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the snapshotted value of a given Maple Pool Token v1 in terms of its liquidity asset,
    /// taken prior to migration
    /// @param _poolV1 The Maple Pool v1
    /// @return valueSnapshot_ The snapshotted Maple Pool Token v1 value
    function getPreMigrationValueSnapshotOfPoolTokenV1(address _poolV1)
        public
        view
        returns (uint256 valueSnapshot_)
    {
        return poolTokenV1ToPreMigrationValueSnapshot[_poolV1];
    }

    /// @notice Migrates tracked v1 pools to tracked v2 pools
    /// @dev Callable by anybody.
    function migratePoolsV1ToV2() public {
        require(
            MAPLE_V1_TO_V2_POOL_MAPPER_CONTRACT.migrationIsAllowed(),
            "migratePoolsV1ToV2: Migration not allowed"
        );

        address[] memory poolsV1 = getUsedLendingPoolsV1();
        uint256 poolsV1Length = poolsV1.length;

        for (uint256 i; i < poolsV1Length; i++) {
            address poolV1 = poolsV1[i];
            address poolV2 = MAPLE_V1_TO_V2_POOL_MAPPER_CONTRACT.getPoolTokenV2FromPoolTokenV1(
                poolV1
            );
            require(poolV2 != address(0), "migratePoolsV1ToV2: No mapping");

            __addUsedPoolV2IfUntracked(poolV2);

            // Remove the old v1 pool from storage
            usedLendingPoolsV1.removeStorageItem(poolV1);
            emit UsedLendingPoolRemoved(poolV1);

            // Free up no-longer-needed snapshot storage
            delete poolTokenV1ToPreMigrationValueSnapshot[poolV1];
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Calculates the value of pool tokens referenced in liquidityAsset
    function __calcLiquidityAssetValueOfPoolTokensV1(
        address _liquidityAsset,
        uint256 _poolTokenAmount
    ) private view returns (uint256 liquidityValue_) {
        uint256 liquidityAssetDecimalsFactor = 10**(uint256(ERC20(_liquidityAsset).decimals()));

        liquidityValue_ = _poolTokenAmount.mul(liquidityAssetDecimalsFactor).div(
            MPT_V1_DECIMALS_FACTOR
        );

        return liquidityValue_;
    }

    /// @dev Helper to calculate the value of a v1 pool token balance of this contract,
    /// in terms of the pool's liquidityAsset
    function __calcPoolV1TokenBalanceValue(address _pool) private returns (uint256 value_) {
        IMapleV1Pool poolContract = IMapleV1Pool(_pool);

        // The liquidity asset balance is derived from the pool token balance (which is stored as a wad),
        // while interest and losses are already returned in terms of the liquidity asset (not pool token)
        uint256 liquidityAssetBalance = __calcLiquidityAssetValueOfPoolTokensV1(
            poolContract.liquidityAsset(),
            ERC20(_pool).balanceOf(address(this))
        );

        uint256 accumulatedInterest = poolContract.withdrawableFundsOf(address(this));
        uint256 accumulatedLosses = poolContract.recognizableLossesOf(address(this));

        value_ = liquidityAssetBalance.add(accumulatedInterest).sub(accumulatedLosses);

        return value_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets all Maple V1 pools currently lent to
    /// @return poolsV1_ The Maple V1 pools currently lent to
    function getUsedLendingPoolsV1() public view returns (address[] memory poolsV1_) {
        return usedLendingPoolsV1;
    }

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
