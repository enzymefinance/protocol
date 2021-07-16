// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../utils/actions/CurveGaugeV2RewardsHandlerBase.sol";
import "../utils/actions/CurveSethLiquidityActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title CurveLiquiditySethAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for liquidity provision in Curve's seth pool (https://www.curve.fi/seth)
/// @dev Rewards tokens are not included as spend assets or incoming assets for claimRewards()
/// or claimRewardsAndReinvest(). Rationale:
/// - rewards tokens can be claimed to the vault outside of the IntegrationManager, so no need
/// to enforce policy management or emit an event
/// - rewards tokens can be outside of the asset universe, in which case they cannot be tracked
contract CurveLiquiditySethAdapter is
    AdapterBase,
    CurveGaugeV2RewardsHandlerBase,
    CurveSethLiquidityActionsMixin
{
    address private immutable LIQUIDITY_GAUGE_TOKEN;
    address private immutable LP_TOKEN;
    address private immutable SETH_TOKEN;

    constructor(
        address _integrationManager,
        address _liquidityGaugeToken,
        address _lpToken,
        address _minter,
        address _pool,
        address _crvToken,
        address _sethToken,
        address _wethToken
    )
        public
        AdapterBase(_integrationManager)
        CurveGaugeV2RewardsHandlerBase(_minter, _crvToken)
        CurveSethLiquidityActionsMixin(_pool, _sethToken, _wethToken)
    {
        LIQUIDITY_GAUGE_TOKEN = _liquidityGaugeToken;
        LP_TOKEN = _lpToken;
        SETH_TOKEN = _sethToken;

        // Max approve contracts to spend relevant tokens
        ERC20(_lpToken).safeApprove(_liquidityGaugeToken, type(uint256).max);
    }

    /// @dev Needed to receive ETH from redemption and to unwrap WETH
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Claims rewards from the Curve Minter as well as pool-specific rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    function claimRewards(
        address _vaultProxy,
        bytes calldata,
        bytes calldata
    ) external onlyIntegrationManager {
        __curveGaugeV2ClaimAllRewards(LIQUIDITY_GAUGE_TOKEN, _vaultProxy);
    }

    /// @notice Lends assets for seth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lend(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_actionData);

        __curveSethLend(
            outgoingWethAmount,
            outgoingSethAmount,
            minIncomingLiquidityGaugeTokenAmount
        );
    }

    /// @notice Lends assets for seth LP tokens, then stakes the received LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lendAndStake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_actionData);

        __curveSethLend(
            outgoingWethAmount,
            outgoingSethAmount,
            minIncomingLiquidityGaugeTokenAmount
        );
        __curveGaugeV2Stake(
            LIQUIDITY_GAUGE_TOKEN,
            LP_TOKEN,
            ERC20(LP_TOKEN).balanceOf(address(this))
        );
    }

    /// @notice Redeems seth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function redeem(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (
            uint256 outgoingLpTokenAmount,
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_actionData);

        __curveSethRedeem(
            outgoingLpTokenAmount,
            minIncomingWethAmount,
            minIncomingSethAmount,
            redeemSingleAsset
        );
    }

    /// @notice Stakes seth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function stake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        __curveGaugeV2Stake(LIQUIDITY_GAUGE_TOKEN, LP_TOKEN, __decodeStakeCallArgs(_actionData));
    }

    /// @notice Unstakes seth LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function unstake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        __curveGaugeV2Unstake(LIQUIDITY_GAUGE_TOKEN, __decodeUnstakeCallArgs(_actionData));
    }

    /// @notice Unstakes seth LP tokens, then redeems them
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function unstakeAndRedeem(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (
            uint256 outgoingLiquidityGaugeTokenAmount,
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_actionData);

        __curveGaugeV2Unstake(LIQUIDITY_GAUGE_TOKEN, outgoingLiquidityGaugeTokenAmount);
        __curveSethRedeem(
            outgoingLiquidityGaugeTokenAmount,
            minIncomingWethAmount,
            minIncomingSethAmount,
            redeemSingleAsset
        );
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
    function parseAssetsForAction(
        address,
        bytes4 _selector,
        bytes calldata _actionData
    )
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
        } else if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == LEND_AND_STAKE_SELECTOR) {
            return __parseAssetsForLendAndStake(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_actionData);
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
    /// during lend() calls
    function __parseAssetsForLend(bytes calldata _actionData)
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
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLpTokenAmount
        ) = __decodeLendCallArgs(_actionData);

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            outgoingWethAmount,
            outgoingSethAmount
        );

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = LP_TOKEN;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingLpTokenAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
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
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_actionData);

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            outgoingWethAmount,
            outgoingSethAmount
        );

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingLiquidityGaugeTokenAmount;

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
    function __parseAssetsForRedeem(bytes calldata _actionData)
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
            uint256 outgoingLpTokenAmount,
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool receiveSingleAsset
        ) = __decodeRedeemCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = LP_TOKEN;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLpTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            minIncomingWethAmount,
            minIncomingSethAmount,
            receiveSingleAsset
        );

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
        uint256 outgoingLpTokenAmount = __decodeStakeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = LP_TOKEN;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLpTokenAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = outgoingLpTokenAmount;

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
        uint256 outgoingLiquidityGaugeTokenAmount = __decodeUnstakeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = LP_TOKEN;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
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
            uint256 outgoingLiquidityGaugeTokenAmount,
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool receiveSingleAsset
        ) = __decodeRedeemCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            minIncomingWethAmount,
            minIncomingSethAmount,
            receiveSingleAsset
        );

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend assets for redeem() and unstakeAndRedeem() calls
    function __parseIncomingAssetsForRedemptionCalls(
        uint256 _minIncomingWethAmount,
        uint256 _minIncomingSethAmount,
        bool _receiveSingleAsset
    )
        private
        view
        returns (address[] memory incomingAssets_, uint256[] memory minIncomingAssetAmounts_)
    {
        if (_receiveSingleAsset) {
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);

            if (_minIncomingWethAmount == 0) {
                require(
                    _minIncomingSethAmount > 0,
                    "__parseIncomingAssetsForRedemptionCalls: No min asset amount specified"
                );
                incomingAssets_[0] = SETH_TOKEN;
                minIncomingAssetAmounts_[0] = _minIncomingSethAmount;
            } else {
                require(
                    _minIncomingSethAmount == 0,
                    "__parseIncomingAssetsForRedemptionCalls: Too many min asset amounts specified"
                );
                incomingAssets_[0] = getCurveSethLiquidityWethToken();
                minIncomingAssetAmounts_[0] = _minIncomingWethAmount;
            }
        } else {
            incomingAssets_ = new address[](2);
            incomingAssets_[0] = getCurveSethLiquidityWethToken();
            incomingAssets_[1] = SETH_TOKEN;

            minIncomingAssetAmounts_ = new uint256[](2);
            minIncomingAssetAmounts_[0] = _minIncomingWethAmount;
            minIncomingAssetAmounts_[1] = _minIncomingSethAmount;
        }

        return (incomingAssets_, minIncomingAssetAmounts_);
    }

    /// @dev Helper function to parse spend assets for lend() and lendAndStake() calls
    function __parseSpendAssetsForLendingCalls(
        uint256 _outgoingWethAmount,
        uint256 _outgoingSethAmount
    ) private view returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_) {
        if (_outgoingWethAmount > 0 && _outgoingSethAmount > 0) {
            spendAssets_ = new address[](2);
            spendAssets_[0] = getCurveSethLiquidityWethToken();
            spendAssets_[1] = SETH_TOKEN;

            spendAssetAmounts_ = new uint256[](2);
            spendAssetAmounts_[0] = _outgoingWethAmount;
            spendAssetAmounts_[1] = _outgoingSethAmount;
        } else if (_outgoingWethAmount > 0) {
            spendAssets_ = new address[](1);
            spendAssets_[0] = getCurveSethLiquidityWethToken();

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = _outgoingWethAmount;
        } else {
            spendAssets_ = new address[](1);
            spendAssets_[0] = SETH_TOKEN;

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = _outgoingSethAmount;
        }

        return (spendAssets_, spendAssetAmounts_);
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    /// @dev Helper to decode the encoded call arguments for lending
    function __decodeLendCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            uint256 outgoingWethAmount_,
            uint256 outgoingSethAmount_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_actionData, (uint256, uint256, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for redeeming.
    /// If `receiveSingleAsset_` is `true`, then one (and only one) of
    /// `minIncomingWethAmount_` and `minIncomingSethAmount_` must be >0
    /// to indicate which asset is to be received.
    function __decodeRedeemCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            uint256 outgoingAssetAmount_,
            uint256 minIncomingWethAmount_,
            uint256 minIncomingSethAmount_,
            bool receiveSingleAsset_
        )
    {
        return abi.decode(_actionData, (uint256, uint256, uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for staking
    function __decodeStakeCallArgs(bytes memory _actionData)
        private
        pure
        returns (uint256 outgoingLpTokenAmount_)
    {
        return abi.decode(_actionData, (uint256));
    }

    /// @dev Helper to decode the encoded call arguments for unstaking
    function __decodeUnstakeCallArgs(bytes memory _actionData)
        private
        pure
        returns (uint256 outgoingLiquidityGaugeTokenAmount_)
    {
        return abi.decode(_actionData, (uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `LIQUIDITY_GAUGE_TOKEN` variable
    /// @return liquidityGaugeToken_ The `LIQUIDITY_GAUGE_TOKEN` variable value
    function getLiquidityGaugeToken() external view returns (address liquidityGaugeToken_) {
        return LIQUIDITY_GAUGE_TOKEN;
    }

    /// @notice Gets the `LP_TOKEN` variable
    /// @return lpToken_ The `LP_TOKEN` variable value
    function getLpToken() external view returns (address lpToken_) {
        return LP_TOKEN;
    }

    /// @notice Gets the `SETH_TOKEN` variable
    /// @return sethToken_ The `SETH_TOKEN` variable value
    function getSethToken() external view returns (address sethToken_) {
        return SETH_TOKEN;
    }
}
