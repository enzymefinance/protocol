// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {IBalancerV2LiquidityGauge} from "../../../../../external-interfaces/IBalancerV2LiquidityGauge.sol";
import {IBalancerV2Vault} from "../../../../../external-interfaces/IBalancerV2Vault.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {CurveGaugeV2RewardsHandlerMixin} from "../utils/0.6.12/actions/CurveGaugeV2RewardsHandlerMixin.sol";
import {BalancerV2LiquidityAdapterBase} from "../utils/0.6.12/bases/BalancerV2LiquidityAdapterBase.sol";

/// @title BalancerV2LiquidityAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Balancer V2 pool liquidity provision and native staking
contract BalancerV2LiquidityAdapter is BalancerV2LiquidityAdapterBase, CurveGaugeV2RewardsHandlerMixin {
    constructor(address _integrationManager, address _balancerVault, address _balancerMinter, address _balToken)
        public
        BalancerV2LiquidityAdapterBase(_integrationManager, _balancerVault)
        CurveGaugeV2RewardsHandlerMixin(_balancerMinter, _balToken)
    {}

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to claim rewards for a given staking token
    function __claimRewards(address _vaultProxy, address _stakingToken) internal override {
        __curveGaugeV2ClaimAllRewards(_stakingToken, _vaultProxy);
    }

    /// @dev Logic to get the BPT address for a given staking token.
    /// For this adapter, the staking token is not validated herein to be a real Balancer gauge,
    /// only to have the required interface.
    function __getBptForStakingToken(address _stakingToken) internal view override returns (address bpt_) {
        return IBalancerV2LiquidityGauge(_stakingToken).lp_token();
    }

    /// @dev Logic to stake BPT to a given staking token.
    /// Staking is always the last action and thus always sent to the _vaultProxy
    /// (rather than a more generically-named `_recipient`).
    function __stake(address _vaultProxy, address _stakingToken, uint256 _bptAmount) internal override {
        __curveGaugeV2Stake(_stakingToken, __getBptForStakingToken(_stakingToken), _bptAmount);

        ERC20(_stakingToken).safeTransfer(_vaultProxy, _bptAmount);
    }

    /// @dev Logic to unstake BPT from a given staking token
    function __unstake(address, address _recipient, address _stakingToken, uint256 _bptAmount) internal override {
        __curveGaugeV2Unstake(_stakingToken, _bptAmount);

        if (_recipient != address(this)) {
            ERC20(__getBptForStakingToken(_stakingToken)).safeTransfer(_recipient, _bptAmount);
        }
    }

    ///////////////////
    // EXTRA ACTIONS //
    ///////////////////

    /// @notice Lends assets for pool tokens on BalancerV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function lend(address _vaultProxy, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (
            bytes32 poolId,
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            IBalancerV2Vault.PoolBalanceChange memory request
        ) = __decodeLpActionCallArgs(_actionData);

        __lend(_vaultProxy, poolId, spendAssets, spendAssetAmounts, request);

        // There can be different join/exit options per Balancer pool type,
        // some of which involve spending only up-to-max amounts
        __pushFullAssetBalances(_vaultProxy, spendAssets);
    }

    /// @notice Redeems pool tokens on BalancerV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function redeem(address _vaultProxy, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (
            bytes32 poolId,
            uint256 spendBptAmount,
            address[] memory expectedIncomingTokens,
            ,
            IBalancerV2Vault.PoolBalanceChange memory request
        ) = __decodeLpActionCallArgs(_actionData);

        __redeem(_vaultProxy, poolId, spendBptAmount, expectedIncomingTokens, request);

        // There can be different join/exit options per Balancer pool type,
        // some of which involve spending only up-to-max amounts
        __pushFullAssetBalance(_vaultProxy, __parseBalancerPoolAddress(poolId));
    }

    /////////////////////////////
    // PARSE ASSETS FOR ACTION //
    /////////////////////////////

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(address _vaultProxy, bytes4 _selector, bytes calldata _actionData)
        public
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
        if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_actionData);
        }

        return super.parseAssetsForAction(_vaultProxy, _selector, _actionData);
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lend() calls
    function __parseAssetsForLend(bytes calldata _encodedCallArgs)
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
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        bytes32 poolId;
        IBalancerV2Vault.PoolBalanceChange memory request;
        (poolId, minIncomingAssetAmounts_[0], spendAssets_, spendAssetAmounts_, request) =
            __decodeLpActionCallArgs(_encodedCallArgs);

        __validateNoInternalBalances(request.useInternalBalance);

        incomingAssets_[0] = __parseBalancerPoolAddress(poolId);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during redeem() calls
    function __parseAssetsForRedeem(bytes calldata _encodedCallArgs)
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
        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);

        bytes32 poolId;
        IBalancerV2Vault.PoolBalanceChange memory request;
        (poolId, spendAssetAmounts_[0], incomingAssets_, minIncomingAssetAmounts_, request) =
            __decodeLpActionCallArgs(_encodedCallArgs);

        __validateNoInternalBalances(request.useInternalBalance);

        spendAssets_[0] = __parseBalancerPoolAddress(poolId);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    //////////////
    // DECODERS //
    //////////////

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeLpActionCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            bytes32 poolId_,
            uint256 bptAmount_,
            address[] memory usedTokens_, // only the assets that will actually be spent/received
            uint256[] memory usedTokenAmounts_, // only the assets that will actually be spent/received
            IBalancerV2Vault.PoolBalanceChange memory request_
        )
    {
        return
            abi.decode(_encodedCallArgs, (bytes32, uint256, address[], uint256[], IBalancerV2Vault.PoolBalanceChange));
    }
}
