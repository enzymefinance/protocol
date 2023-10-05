// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {IConvexCurveLpStakingWrapperFactory} from
    "../../../../../persistent/staking-wrappers/convex-curve-lp/IConvexCurveLpStakingWrapperFactory.sol";
import {CurvePriceFeed} from "../../../../infrastructure/price-feeds/derivatives/feeds/CurvePriceFeed.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {StakingWrapperActionsMixin} from "../utils/0.6.12/actions/StakingWrapperActionsMixin.sol";
import {CurveLiquidityAdapterBase} from "../utils/0.6.12/bases/CurveLiquidityAdapterBase.sol";

/// @title ConvexCurveLpStakingAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for staking Curve LP tokens via Convex,
/// with optional combined end-to-end liquidity provision via Curve
/// @dev Rewards tokens are not included as incoming assets for claimRewards()
/// Rationale:
/// - rewards tokens can be claimed to the vault outside of the IntegrationManager, so no need
/// to enforce policy management or emit an event
/// - rewards tokens can be outside of the asset universe, in which case they cannot be tracked
contract ConvexCurveLpStakingAdapter is CurveLiquidityAdapterBase, StakingWrapperActionsMixin {
    IConvexCurveLpStakingWrapperFactory private immutable STAKING_WRAPPER_FACTORY_CONTRACT;
    CurvePriceFeed private immutable CURVE_PRICE_FEED_CONTRACT;

    constructor(
        address _integrationManager,
        address _curvePriceFeed,
        address _wrappedNativeAsset,
        address _stakingWrapperFactory,
        address _nativeAssetAddress
    ) public CurveLiquidityAdapterBase(_integrationManager, _wrappedNativeAsset, _nativeAssetAddress) {
        CURVE_PRICE_FEED_CONTRACT = CurvePriceFeed(_curvePriceFeed);
        STAKING_WRAPPER_FACTORY_CONTRACT = IConvexCurveLpStakingWrapperFactory(_stakingWrapperFactory);
    }

    // EXTERNAL FUNCTIONS

    /// @notice Claims all rewards for a given staking token
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function claimRewards(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        __stakingWrapperClaimRewardsFor(__decodeClaimRewardsCallArgs(_actionData), _vaultProxy);
    }

    /// @notice Lends assets for LP tokens, then stakes the received LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lendAndStake(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
    {
        (
            address pool,
            uint256[] memory orderedOutgoingAssetAmounts,
            address incomingStakingToken,
            uint256 minIncomingStakingTokenAmount,
            bool useUnderlyings
        ) = __decodeLendAndStakeCallArgs(_actionData);
        (address[] memory spendAssets,,) = __decodeAssetData(_assetData);

        address lpToken = CURVE_PRICE_FEED_CONTRACT.getLpTokenForPool(pool);

        __curveAddLiquidity(
            pool, spendAssets, orderedOutgoingAssetAmounts, minIncomingStakingTokenAmount, useUnderlyings
        );

        __stakingWrapperStake(incomingStakingToken, _vaultProxy, ERC20(lpToken).balanceOf(address(this)), lpToken);
    }

    /// @notice Stakes LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function stake(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
    {
        (, address incomingStakingToken, uint256 amount) = __decodeStakeCallArgs(_actionData);

        (address[] memory spendAssets,,) = __decodeAssetData(_assetData);

        __stakingWrapperStake(incomingStakingToken, _vaultProxy, amount, spendAssets[0]);
    }

    /// @notice Unstakes LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function unstake(address _vaultProxy, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (, address outgoingStakingToken, uint256 amount) = __decodeUnstakeCallArgs(_actionData);

        __stakingWrapperUnstake(outgoingStakingToken, _vaultProxy, _vaultProxy, amount);
    }

    /// @notice Unstakes LP tokens, then redeems them
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function unstakeAndRedeem(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (
            address pool,
            address outgoingStakingToken,
            uint256 outgoingStakingTokenAmount,
            bool useUnderlyings,
            RedeemType redeemType,
            bytes memory incomingAssetsData
        ) = __decodeUnstakeAndRedeemCallArgs(_actionData);

        __stakingWrapperUnstake(outgoingStakingToken, _vaultProxy, address(this), outgoingStakingTokenAmount);

        __curveRedeem(pool, outgoingStakingTokenAmount, useUnderlyings, redeemType, incomingAssetsData);
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(address, bytes4 _selector, bytes calldata _actionData)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == CLAIM_REWARDS_SELECTOR) {
            return __parseAssetsForClaimRewards();
        } else if (_selector == LEND_AND_STAKE_SELECTOR) {
            return __parseAssetsForLendAndStake(_actionData);
        } else if (_selector == STAKE_SELECTOR) {
            return __parseAssetsForStake(_actionData);
        } else if (_selector == UNSTAKE_SELECTOR) {
            return __parseAssetsForUnstake(_actionData);
        } else if (_selector == UNSTAKE_AND_REDEEM_SELECTOR) {
            return __parseAssetsForUnstakeAndRedeem(_actionData);
        }

        revert("parseAssetsForAction: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewards() calls.
    /// No action required, all values empty.
    function __parseAssetsForClaimRewards()
        private
        pure
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        return (
            IIntegrationManager.SpendAssetsHandleType.None,
            new address[](0),
            new uint256[](0),
            new address[](0),
            new uint256[](0)
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lendAndStake() calls
    function __parseAssetsForLendAndStake(bytes calldata _actionData)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            address pool,
            uint256[] memory orderedOutgoingAssetAmounts,
            address incomingStakingToken,
            uint256 minIncomingStakingTokenAmount,
            bool useUnderlyings
        ) = __decodeLendAndStakeCallArgs(_actionData);

        __validatePoolForWrapper(pool, incomingStakingToken);

        (spendAssets_, spendAssetAmounts_) =
            __parseSpendAssetsForLendingCalls(pool, orderedOutgoingAssetAmounts, useUnderlyings);

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingStakingToken;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingStakingTokenAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during stake() calls
    function __parseAssetsForStake(bytes calldata _actionData)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (, address incomingStakingToken, uint256 amount) = __decodeStakeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = STAKING_WRAPPER_FACTORY_CONTRACT.getCurveLpTokenForWrapper(incomingStakingToken);

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingStakingToken;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = amount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during unstake() calls
    function __parseAssetsForUnstake(bytes calldata _actionData)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (, address outgoingStakingToken, uint256 amount) = __decodeUnstakeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingStakingToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = STAKING_WRAPPER_FACTORY_CONTRACT.getCurveLpTokenForWrapper(outgoingStakingToken);

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = amount;

        // SpendAssetsHandleType is `Approve`, since staking wrapper allows unstaking on behalf
        return (
            IIntegrationManager.SpendAssetsHandleType.Approve,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during unstakeAndRedeem() calls
    function __parseAssetsForUnstakeAndRedeem(bytes calldata _actionData)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            address pool,
            address outgoingStakingToken,
            uint256 outgoingStakingTokenAmount,
            bool useUnderlyings,
            RedeemType redeemType,
            bytes memory incomingAssetsData
        ) = __decodeUnstakeAndRedeemCallArgs(_actionData);

        __validatePoolForWrapper(pool, outgoingStakingToken);

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingStakingToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingStakingTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) =
            __parseIncomingAssetsForRedemptionCalls(pool, useUnderlyings, redeemType, incomingAssetsData);

        // SpendAssetsHandleType is `Approve`, since staking wrapper allows unstaking on behalf
        return (
            IIntegrationManager.SpendAssetsHandleType.Approve,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper to validate a given Curve `pool` for a given convex staking wrapper
    function __validatePoolForWrapper(address _pool, address _wrapper) private view {
        address lpToken = STAKING_WRAPPER_FACTORY_CONTRACT.getCurveLpTokenForWrapper(_wrapper);
        require(lpToken == CURVE_PRICE_FEED_CONTRACT.getLpTokenForPool(_pool), "__validatePoolForWrapper: Invalid");
    }
}
