// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../utils/actions/CurveGaugeV2RewardsHandlerBase.sol";
import "../utils/actions/CurveSethLiquidityActionsMixin.sol";
import "../utils/actions/UniswapV2ActionsMixin.sol";
import "../utils/AdapterBase2.sol";

/// @title CurveLiquiditySethAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for liquidity provision in Curve's seth pool (https://www.curve.fi/seth)
/// @dev Rewards tokens are not included as spend assets or incoming assets for claimRewards()
/// or claimRewardsAndReinvest(). Rationale:
/// - rewards tokens can be claimed to the vault outside of the IntegrationManager, so no need
/// to enforce policy management or emit an event
/// - rewards tokens can be outside of the asset universe, in which case they cannot be tracked
/// This adapter will need to be re-deployed if UniswapV2 low liquidity becomes
/// a concern for rewards tokens when using claimRewardsAndReinvest().
contract CurveLiquiditySethAdapter is
    AdapterBase2,
    CurveGaugeV2RewardsHandlerBase,
    CurveSethLiquidityActionsMixin,
    UniswapV2ActionsMixin
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
        address _wethToken,
        address _uniswapV2Router2
    )
        public
        AdapterBase2(_integrationManager)
        CurveGaugeV2RewardsHandlerBase(_minter, _crvToken)
        CurveSethLiquidityActionsMixin(_pool, _sethToken, _wethToken)
        UniswapV2ActionsMixin(_uniswapV2Router2)
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

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "CURVE_LIQUIDITY_SETH";
    }

    /// @notice Approves assets from the vault to be used by this contract.
    /// @dev No logic necessary. Exists only to grant adapter with necessary approvals from the vault,
    /// which takes place in the IntegrationManager.
    function approveAssets(
        address,
        bytes calldata,
        bytes calldata
    ) external {}

    /// @notice Claims rewards from the Curve Minter as well as pool-specific rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    function claimRewards(
        address _vaultProxy,
        bytes calldata,
        bytes calldata
    ) external onlyIntegrationManager {
        __curveGaugeV2ClaimAllRewards(LIQUIDITY_GAUGE_TOKEN, _vaultProxy);
    }

    /// @notice Claims rewards and then compounds the rewards tokens back into the staked LP token
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @dev Requires the adapter to be granted an allowance of each reward token by the vault.
    /// For supported assets (e.g., CRV), this must be done via the `approveAssets()` function in this adapter.
    /// For unsupported assets, this must be done via `ComptrollerProxy.vaultCallOnContract()`.
    /// The `useFullBalances` option indicates whether to use only the newly claimed balances of
    /// rewards tokens, or whether to use the full balances of these assets in the vault.
    function claimRewardsAndReinvest(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            bool useFullBalances,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeClaimRewardsAndReinvestCallArgs(_encodedCallArgs);

        (
            address[] memory rewardsTokens,
            uint256[] memory rewardsTokenAmountsToUse
        ) = __curveGaugeV2ClaimRewardsAndPullBalances(
            LIQUIDITY_GAUGE_TOKEN,
            _vaultProxy,
            useFullBalances
        );

        // Swap all reward tokens to WETH via UniswapV2.
        // Note that if a reward token takes a fee on transfer,
        // we could not use these memory balances.
        __uniswapV2SwapManyToOne(
            address(this),
            rewardsTokens,
            rewardsTokenAmountsToUse,
            getCurveSethLiquidityWethToken(),
            address(0)
        );

        // Lend all received WETH for staked LP tokens
        uint256 wethBalance = ERC20(getCurveSethLiquidityWethToken()).balanceOf(address(this));
        if (wethBalance > 0) {
            __curveSethLend(wethBalance, 0, minIncomingLiquidityGaugeTokenAmount);
            __curveGaugeV2Stake(
                LIQUIDITY_GAUGE_TOKEN,
                LP_TOKEN,
                ERC20(LP_TOKEN).balanceOf(address(this))
            );
        }
    }

    /// @notice Claims rewards and then swaps the rewards tokens to the specified asset via UniswapV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @dev Requires the adapter to be granted an allowance of each reward token by the vault.
    /// For supported assets (e.g., CRV), this must be done via the `approveAssets()` function in this adapter.
    /// For unsupported assets, this must be done via `ComptrollerProxy.vaultCallOnContract()`.
    /// The `useFullBalances` option indicates whether to use only the newly claimed balances of
    /// rewards tokens, or whether to use the full balances of these assets in the vault.
    function claimRewardsAndSwap(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata
    ) external onlyIntegrationManager {
        (bool useFullBalances, address incomingAsset, ) = __decodeClaimRewardsAndSwapCallArgs(
            _encodedCallArgs
        );

        (
            address[] memory rewardsTokens,
            uint256[] memory rewardsTokenAmountsToUse
        ) = __curveGaugeV2ClaimRewardsAndPullBalances(
            LIQUIDITY_GAUGE_TOKEN,
            _vaultProxy,
            useFullBalances
        );

        // Swap all reward tokens to the designated incomingAsset via UniswapV2.
        // Note that if a reward token takes a fee on transfer,
        // we could not use these memory balances.
        __uniswapV2SwapManyToOne(
            _vaultProxy,
            rewardsTokens,
            rewardsTokenAmountsToUse,
            incomingAsset,
            getCurveSethLiquidityWethToken()
        );
    }

    /// @notice Lends assets for seth LP tokens
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
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        __curveSethLend(
            outgoingWethAmount,
            outgoingSethAmount,
            minIncomingLiquidityGaugeTokenAmount
        );
    }

    /// @notice Lends assets for seth LP tokens, then stakes the received LP tokens
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
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

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
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __curveSethRedeem(
            outgoingLpTokenAmount,
            minIncomingWethAmount,
            minIncomingSethAmount,
            redeemSingleAsset
        );
    }

    /// @notice Stakes seth LP tokens
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
            LIQUIDITY_GAUGE_TOKEN,
            LP_TOKEN,
            __decodeStakeCallArgs(_encodedCallArgs)
        );
    }

    /// @notice Unstakes seth LP tokens
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
        __curveGaugeV2Unstake(LIQUIDITY_GAUGE_TOKEN, __decodeUnstakeCallArgs(_encodedCallArgs));
    }

    /// @notice Unstakes seth LP tokens, then redeems them
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
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool redeemSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

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
        if (_selector == APPROVE_ASSETS_SELECTOR) {
            return __parseAssetsForApproveAssets(_encodedCallArgs);
        } else if (_selector == CLAIM_REWARDS_SELECTOR) {
            return __parseAssetsForClaimRewards();
        } else if (_selector == CLAIM_REWARDS_AND_REINVEST_SELECTOR) {
            return __parseAssetsForClaimRewardsAndReinvest(_encodedCallArgs);
        } else if (_selector == CLAIM_REWARDS_AND_SWAP_SELECTOR) {
            return __parseAssetsForClaimRewardsAndSwap(_encodedCallArgs);
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
    /// during approveAssets() calls
    function __parseAssetsForApproveAssets(bytes calldata _encodedCallArgs)
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
        (spendAssets_, spendAssetAmounts_) = __decodeApproveAssetsCallArgs(_encodedCallArgs);
        require(
            spendAssets_.length == spendAssetAmounts_.length,
            "__parseAssetsForApproveAssets: Unequal arrays"
        );

        // Validate that only rewards tokens are given allowances
        address[] memory rewardsTokens = __curveGaugeV2GetRewardsTokensWithCrv(
            LIQUIDITY_GAUGE_TOKEN
        );
        for (uint256 i; i < spendAssets_.length; i++) {
            // Allow revoking approval for any asset
            if (spendAssetAmounts_[i] > 0) {
                require(
                    rewardsTokens.contains(spendAssets_[i]),
                    "__parseAssetsForApproveAssets: Invalid reward token"
                );
            }
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Approve,
            spendAssets_,
            spendAssetAmounts_,
            new address[](0),
            new uint256[](0)
        );
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
    /// during claimRewardsAndReinvest() calls.
    function __parseAssetsForClaimRewardsAndReinvest(bytes calldata _encodedCallArgs)
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
        (, uint256 minIncomingLiquidityGaugeTokenAmount) = __decodeClaimRewardsAndReinvestCallArgs(
            _encodedCallArgs
        );

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingLiquidityGaugeTokenAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.None,
            new address[](0),
            new uint256[](0),
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewardsAndSwap() calls.
    function __parseAssetsForClaimRewardsAndSwap(bytes calldata _encodedCallArgs)
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
        (
            ,
            address incomingAsset,
            uint256 minIncomingAssetAmount
        ) = __decodeClaimRewardsAndSwapCallArgs(_encodedCallArgs);

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingAsset;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.None,
            new address[](0),
            new uint256[](0),
            incomingAssets_,
            minIncomingAssetAmounts_
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
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLpTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

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
            uint256 outgoingWethAmount,
            uint256 outgoingSethAmount,
            uint256 minIncomingLiquidityGaugeTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

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
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool receiveSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

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
            uint256 minIncomingWethAmount,
            uint256 minIncomingSethAmount,
            bool receiveSingleAsset
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

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

    /// @dev Helper to decode the encoded call arguments for approving asset allowances
    function __decodeApproveAssetsCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        return abi.decode(_encodedCallArgs, (address[], uint256[]));
    }

    /// @dev Helper to decode the encoded call arguments for claiming rewards
    function __decodeClaimRewardsAndReinvestCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (bool useFullBalances_, uint256 minIncomingLiquidityGaugeTokenAmount_)
    {
        return abi.decode(_encodedCallArgs, (bool, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for claiming rewards and swapping
    function __decodeClaimRewardsAndSwapCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            bool useFullBalances_,
            address incomingAsset_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (bool, address, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for lending
    function __decodeLendCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingWethAmount_,
            uint256 outgoingSethAmount_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for redeeming.
    /// If `receiveSingleAsset_` is `true`, then one (and only one) of
    /// `minIncomingWethAmount_` and `minIncomingSethAmount_` must be >0
    /// to indicate which asset is to be received.
    function __decodeRedeemCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingAssetAmount_,
            uint256 minIncomingWethAmount_,
            uint256 minIncomingSethAmount_,
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
