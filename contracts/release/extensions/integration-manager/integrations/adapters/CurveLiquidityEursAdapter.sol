// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../utils/actions/CurveGaugeV2RewardsHandlerBase.sol";
import "../utils/actions/CurveEursLiquidityActionsMixin.sol";
import "../utils/AdapterBase2.sol";

/// @title CurveLiquidityEursAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for liquidity provision in Curve's eurs pool (https://www.curve.fi/eurs)
/// @dev Rewards tokens are not included as spend assets or incoming assets for claimRewards()
/// Rationale:
/// - rewards tokens can be claimed to the vault outside of the IntegrationManager, so no need
/// to enforce policy management or emit an event
/// - rewards tokens can be outside of the asset universe, in which case they cannot be tracked
contract CurveLiquidityEursAdapter is
    AdapterBase2,
    CurveGaugeV2RewardsHandlerBase,
    CurveEursLiquidityActionsMixin
{
    address private immutable EURS_TOKEN;
    address private immutable LIQUIDITY_GAUGE_TOKEN;
    address private immutable LP_TOKEN;
    address private immutable SEUR_TOKEN;

    constructor(
        address _integrationManager,
        address _liquidityGaugeToken,
        address _lpToken,
        address _minter,
        address _pool,
        address _crvToken,
        address _eursToken,
        address _seurToken
    )
        public
        AdapterBase2(_integrationManager)
        CurveGaugeV2RewardsHandlerBase(_minter, _crvToken)
        CurveEursLiquidityActionsMixin(_pool, _eursToken, _seurToken)
    {
        EURS_TOKEN = _eursToken;
        LIQUIDITY_GAUGE_TOKEN = _liquidityGaugeToken;
        LP_TOKEN = _lpToken;
        SEUR_TOKEN = _seurToken;

        // Max approve contracts to spend relevant tokens
        ERC20(_lpToken).safeApprove(_liquidityGaugeToken, type(uint256).max);
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "CURVE_LIQUIDITY_EURS";
    }

    /// @notice Claims rewards from the Curve Minter as well as pool-specific rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    function claimRewards(
        address _vaultProxy,
        bytes calldata,
        bytes calldata
    ) external onlyIntegrationManager {
        __curveGaugeV2ClaimAllRewards(getLiquidityGaugeToken(), _vaultProxy);
    }

    /// @notice Lends assets for eurs LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingEursAmount,
            uint256 outgoingSeurAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        __curveEursLend(
            outgoingEursAmount,
            outgoingSeurAmount,
            minIncomingLiquidityGaugeTokenAmount
        );
    }

    /// @notice Lends assets for eurs LP tokens, then stakes the received LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lendAndStake(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingEursAmount,
            uint256 outgoingSeurAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        __curveEursLend(
            outgoingEursAmount,
            outgoingSeurAmount,
            minIncomingLiquidityGaugeTokenAmount
        );
        __curveGaugeV2Stake(
            getLiquidityGaugeToken(),
            getLpToken(),
            ERC20(getLpToken()).balanceOf(address(this))
        );
    }

    /// @notice Redeems eurs LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingLpTokenAmount,
            uint256 minIncomingEursAmount,
            uint256 minIncomingSeurAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __curveEursRedeem(
            outgoingLpTokenAmount,
            minIncomingEursAmount,
            minIncomingSeurAmount,
            redeemSingleAsset
        );
    }

    /// @notice Stakes eurs LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function stake(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        __curveGaugeV2Stake(
            getLiquidityGaugeToken(),
            getLpToken(),
            __decodeStakeCallArgs(_encodedCallArgs)
        );
    }

    /// @notice Unstakes eurs LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function unstake(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        __curveGaugeV2Unstake(getLiquidityGaugeToken(), __decodeUnstakeCallArgs(_encodedCallArgs));
    }

    /// @notice Unstakes eurs LP tokens, then redeems them
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function unstakeAndRedeem(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingLiquidityGaugeTokenAmount,
            uint256 minIncomingEursAmount,
            uint256 minIncomingSeurAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __curveGaugeV2Unstake(getLiquidityGaugeToken(), outgoingLiquidityGaugeTokenAmount);
        __curveEursRedeem(
            outgoingLiquidityGaugeTokenAmount,
            minIncomingEursAmount,
            minIncomingSeurAmount,
            redeemSingleAsset
        );
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
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
            return __parseAssetsForLend(_encodedCallArgs);
        } else if (_selector == LEND_AND_STAKE_SELECTOR) {
            return __parseAssetsForLendAndStake(_encodedCallArgs);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_encodedCallArgs);
        } else if (_selector == STAKE_SELECTOR) {
            return __parseAssetsForStake(_encodedCallArgs);
        } else if (_selector == UNSTAKE_SELECTOR) {
            return __parseAssetsForUnstake(_encodedCallArgs);
        } else if (_selector == UNSTAKE_AND_REDEEM_SELECTOR) {
            return __parseAssetsForUnstakeAndRedeem(_encodedCallArgs);
        }

        revert("parseAssetsForMethod: _selector invalid");
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
    function __parseAssetsForLend(bytes calldata _encodedCallArgs)
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
            uint256 outgoingEursAmount,
            uint256 outgoingSeurAmount,
            uint256 minIncomingLpTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            outgoingEursAmount,
            outgoingSeurAmount
        );

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getLpToken();

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
    function __parseAssetsForLendAndStake(bytes calldata _encodedCallArgs)
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
            uint256 outgoingEursAmount,
            uint256 outgoingSeurAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            outgoingEursAmount,
            outgoingSeurAmount
        );

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getLiquidityGaugeToken();

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
    function __parseAssetsForRedeem(bytes calldata _encodedCallArgs)
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
            uint256 minIncomingEursAmount,
            uint256 minIncomingSeurAmount,
            bool receiveSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getLpToken();

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLpTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            minIncomingEursAmount,
            minIncomingSeurAmount,
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
    function __parseAssetsForStake(bytes calldata _encodedCallArgs)
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
        uint256 outgoingLpTokenAmount = __decodeStakeCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getLpToken();

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLpTokenAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getLiquidityGaugeToken();

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
    function __parseAssetsForUnstake(bytes calldata _encodedCallArgs)
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
        uint256 outgoingLiquidityGaugeTokenAmount = __decodeUnstakeCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getLiquidityGaugeToken();

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getLpToken();

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
    function __parseAssetsForUnstakeAndRedeem(bytes calldata _encodedCallArgs)
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
            uint256 minIncomingEursAmount,
            uint256 minIncomingSeurAmount,
            bool receiveSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getLiquidityGaugeToken();

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            minIncomingEursAmount,
            minIncomingSeurAmount,
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
        uint256 _minIncomingEursAmount,
        uint256 _minIncomingSeurAmount,
        bool _receiveSingleAsset
    )
        private
        view
        returns (address[] memory incomingAssets_, uint256[] memory minIncomingAssetAmounts_)
    {
        if (_receiveSingleAsset) {
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);

            if (_minIncomingEursAmount == 0) {
                require(
                    _minIncomingSeurAmount > 0,
                    "__parseIncomingAssetsForRedemptionCalls: No min asset amount specified"
                );
                incomingAssets_[0] = getSeurToken();
                minIncomingAssetAmounts_[0] = _minIncomingSeurAmount;
            } else {
                require(
                    _minIncomingSeurAmount == 0,
                    "__parseIncomingAssetsForRedemptionCalls: Too many min asset amounts specified"
                );
                incomingAssets_[0] = getEursToken();
                minIncomingAssetAmounts_[0] = _minIncomingEursAmount;
            }
        } else {
            incomingAssets_ = new address[](2);
            incomingAssets_[0] = getEursToken();
            incomingAssets_[1] = getSeurToken();

            minIncomingAssetAmounts_ = new uint256[](2);
            minIncomingAssetAmounts_[0] = _minIncomingEursAmount;
            minIncomingAssetAmounts_[1] = _minIncomingSeurAmount;
        }

        return (incomingAssets_, minIncomingAssetAmounts_);
    }

    /// @dev Helper function to parse spend assets for lend() and lendAndStake() calls
    function __parseSpendAssetsForLendingCalls(
        uint256 _outgoingEursAmount,
        uint256 _outgoingSeurAmount
    ) private view returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_) {
        if (_outgoingEursAmount > 0 && _outgoingSeurAmount > 0) {
            spendAssets_ = new address[](2);
            spendAssets_[0] = getEursToken();
            spendAssets_[1] = getSeurToken();

            spendAssetAmounts_ = new uint256[](2);
            spendAssetAmounts_[0] = _outgoingEursAmount;
            spendAssetAmounts_[1] = _outgoingSeurAmount;
        } else if (_outgoingEursAmount > 0) {
            spendAssets_ = new address[](1);
            spendAssets_[0] = getEursToken();

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = _outgoingEursAmount;
        } else {
            spendAssets_ = new address[](1);
            spendAssets_[0] = getSeurToken();

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = _outgoingSeurAmount;
        }

        return (spendAssets_, spendAssetAmounts_);
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    /// @dev Helper to decode the encoded call arguments for lending
    function __decodeLendCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingEursAmount_,
            uint256 outgoingSeurAmount_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for redeeming.
    /// If `receiveSingleAsset_` is `true`, then one (and only one) of
    /// `minIncomingEursAmount_` and `minIncomingSeurAmount_` must be >0
    /// to indicate which asset is to be received.
    function __decodeRedeemCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingAssetAmount_,
            uint256 minIncomingEursAmount_,
            uint256 minIncomingSeurAmount_,
            bool receiveSingleAsset_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256, uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for staking
    function __decodeStakeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 outgoingLpTokenAmount_)
    {
        return abi.decode(_encodedCallArgs, (uint256));
    }

    /// @dev Helper to decode the encoded call arguments for unstaking
    function __decodeUnstakeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 outgoingLiquidityGaugeTokenAmount_)
    {
        return abi.decode(_encodedCallArgs, (uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `EURS_TOKEN` variable
    /// @return eursToken_ The `EURS_TOKEN` variable value
    function getEursToken() public view returns (address eursToken_) {
        return EURS_TOKEN;
    }

    /// @notice Gets the `LIQUIDITY_GAUGE_TOKEN` variable
    /// @return liquidityGaugeToken_ The `LIQUIDITY_GAUGE_TOKEN` variable value
    function getLiquidityGaugeToken() public view returns (address liquidityGaugeToken_) {
        return LIQUIDITY_GAUGE_TOKEN;
    }

    /// @notice Gets the `LP_TOKEN` variable
    /// @return lpToken_ The `LP_TOKEN` variable value
    function getLpToken() public view returns (address lpToken_) {
        return LP_TOKEN;
    }

    /// @notice Gets the `SEUR_TOKEN` variable
    /// @return seurToken_ The `SEUR_TOKEN` variable value
    function getSeurToken() public view returns (address seurToken_) {
        return SEUR_TOKEN;
    }
}
