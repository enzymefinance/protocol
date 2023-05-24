// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../infrastructure/staking-wrappers/aura-balancer-v2-lp/AuraBalancerV2LpStakingWrapperFactory.sol";
import "../utils/actions/StakingWrapperActionsMixin.sol";
import "../utils/bases/BalancerV2LiquidityAdapterBase.sol";

/// @title AuraBalancerV2LpStakingAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for staking Balancer pool tokens via Aura
/// with optional combined end-to-end liquidity provision via Balancer
contract AuraBalancerV2LpStakingAdapter is BalancerV2LiquidityAdapterBase, StakingWrapperActionsMixin {
    AuraBalancerV2LpStakingWrapperFactory private immutable STAKING_WRAPPER_FACTORY_CONTRACT;

    constructor(address _integrationManager, address _balancerVault, address _stakingWrapperFactory)
        public
        BalancerV2LiquidityAdapterBase(_integrationManager, _balancerVault)
    {
        STAKING_WRAPPER_FACTORY_CONTRACT = AuraBalancerV2LpStakingWrapperFactory(_stakingWrapperFactory);
    }

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to claim rewards for a given staking token
    function __claimRewards(address _vaultProxy, address _stakingToken) internal override {
        __stakingWrapperClaimRewardsFor(_stakingToken, _vaultProxy);
    }

    /// @dev Logic to get the BPT address for a given staking token.
    /// For this adapter, the staking token is validated herein.
    function __getBptForStakingToken(address _stakingToken) internal view override returns (address bpt_) {
        return STAKING_WRAPPER_FACTORY_CONTRACT.getCurveLpTokenForWrapper(_stakingToken);
    }

    /// @dev Logic to stake BPT to a given staking token.
    /// Staking is always the last action and thus always sent to the _vaultProxy
    /// (rather than a more generically-named `_recipient`).
    function __stake(address _vaultProxy, address _stakingToken, uint256 _bptAmount) internal override {
        __stakingWrapperStake(_stakingToken, _vaultProxy, _bptAmount, __getBptForStakingToken(_stakingToken));
    }

    /// @dev Logic to unstake BPT from a given staking token
    function __unstake(address _from, address _recipient, address _stakingToken, uint256 _bptAmount)
        internal
        override
    {
        __stakingWrapperUnstake(_stakingToken, _from, _recipient, _bptAmount, false);
    }

    ///////////////
    // OVERRIDES //
    ///////////////

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during unstake() calls.
    /// Overridden to use `SpendAssetsHandleType.Approve`.
    function __parseAssetsForUnstake(bytes calldata _actionData)
        internal
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
        (, spendAssets_, spendAssetAmounts_, incomingAssets_, minIncomingAssetAmounts_) =
            super.__parseAssetsForUnstake(_actionData);

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
        internal
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
        (, spendAssets_, spendAssetAmounts_, incomingAssets_, minIncomingAssetAmounts_) =
            super.__parseAssetsForUnstakeAndRedeem(_actionData);

        // SpendAssetsHandleType is `Approve`, since staking wrapper allows unstaking on behalf
        return (
            IIntegrationManager.SpendAssetsHandleType.Approve,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }
}
