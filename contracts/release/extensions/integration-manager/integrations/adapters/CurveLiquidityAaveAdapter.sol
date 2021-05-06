// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../utils/actions/CurveAaveLiquidityActionsMixin.sol";
import "../utils/actions/CurveGaugeV2RewardsHandlerBase.sol";
import "../utils/actions/UniswapV2ActionsMixin.sol";
import "../utils/AdapterBase2.sol";

/// @title CurveLiquidityAaveAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for liquidity provision in Curve's aave pool (https://www.curve.fi/aave)
/// @dev Rewards tokens are not included as spend assets or incoming assets for claimRewards()
/// or claimRewardsAndReinvest(). Rationale:
/// - rewards tokens can be claimed to the vault outside of the IntegrationManager, so no need
/// to enforce policy management or emit an event
/// - rewards tokens can be outside of the asset universe, in which case they cannot be tracked
/// This adapter will need to be re-deployed if UniswapV2 low liquidity becomes
/// a concern for rewards tokens when using claimRewardsAndReinvest().
contract CurveLiquidityAaveAdapter is
    AdapterBase2,
    CurveGaugeV2RewardsHandlerBase,
    CurveAaveLiquidityActionsMixin,
    UniswapV2ActionsMixin
{
    address private immutable AAVE_DAI_TOKEN;
    address private immutable AAVE_USDC_TOKEN;
    address private immutable AAVE_USDT_TOKEN;

    address private immutable DAI_TOKEN;
    address private immutable USDC_TOKEN;
    address private immutable USDT_TOKEN;

    address private immutable LIQUIDITY_GAUGE_TOKEN;
    address private immutable LP_TOKEN;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _liquidityGaugeToken,
        address _lpToken,
        address _minter,
        address _pool,
        address _crvToken,
        address _wethToken,
        address[3] memory _aaveTokens, // [aDAI, aUSDC, aUSDT]
        address[3] memory _underlyingTokens, // [DAI, USDC, USDT]
        address _uniswapV2Router2
    )
        public
        AdapterBase2(_integrationManager)
        CurveAaveLiquidityActionsMixin(_pool, _aaveTokens, _underlyingTokens)
        CurveGaugeV2RewardsHandlerBase(_minter, _crvToken)
        UniswapV2ActionsMixin(_uniswapV2Router2)
    {
        AAVE_DAI_TOKEN = _aaveTokens[0];
        AAVE_USDC_TOKEN = _aaveTokens[1];
        AAVE_USDT_TOKEN = _aaveTokens[2];

        DAI_TOKEN = _underlyingTokens[0];
        USDC_TOKEN = _underlyingTokens[1];
        USDT_TOKEN = _underlyingTokens[2];

        LIQUIDITY_GAUGE_TOKEN = _liquidityGaugeToken;
        LP_TOKEN = _lpToken;
        WETH_TOKEN = _wethToken;

        // Max approve liquidity gauge to spend LP token
        ERC20(_lpToken).safeApprove(_liquidityGaugeToken, type(uint256).max);
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "CURVE_LIQUIDITY_AAVE";
    }

    /// @notice Approves assets from the vault to be used by this contract.
    /// @dev No logic necessary. Exists only to grant adapter with necessary approvals from the vault,
    /// which takes place in the IntegrationManager.
    function approveAssets(
        address,
        bytes calldata,
        bytes calldata
    ) external {}

    /// @notice Claims rewards from the Curve liquidity gauge as well as pool-specific rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    function claimRewards(
        address _vaultProxy,
        bytes calldata,
        bytes calldata
    ) external onlyIntegrationManager {
        __curveGaugeV2ClaimAllRewards(LIQUIDITY_GAUGE_TOKEN, _vaultProxy);
    }

    /// @notice Claims rewards and then compounds the accrued rewards back into the staked LP token
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
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
            uint256 minIncomingLiquidityGaugeTokenAmount,
            uint8 intermediaryUnderlyingAssetIndex
        ) = __decodeClaimRewardsAndReinvestCallArgs(_encodedCallArgs);

        (
            address[] memory rewardsTokens,
            uint256[] memory rewardsTokenAmountsToUse
        ) = __curveGaugeV2ClaimRewardsAndPullBalances(
            LIQUIDITY_GAUGE_TOKEN,
            _vaultProxy,
            useFullBalances
        );

        address intermediaryUnderlyingAsset = getAssetByPoolIndex(
            intermediaryUnderlyingAssetIndex,
            true
        );

        // Swap all reward tokens to the designated pool underlying token via UniswapV2.
        // Note that if a reward token takes a fee on transfer,
        // we could not use these memory balances.
        __uniswapV2SwapManyToOne(
            address(this),
            rewardsTokens,
            rewardsTokenAmountsToUse,
            intermediaryUnderlyingAsset,
            WETH_TOKEN
        );

        // Lend all received underlying for staked LP tokens
        uint256 intermediaryUnderlyingAssetBalance = ERC20(intermediaryUnderlyingAsset).balanceOf(
            address(this)
        );
        if (intermediaryUnderlyingAssetBalance > 0) {
            uint256[3] memory orderedUnderlyingAssetAmounts;
            orderedUnderlyingAssetAmounts[intermediaryUnderlyingAssetIndex] = intermediaryUnderlyingAssetBalance;

            __curveAaveLend(
                orderedUnderlyingAssetAmounts,
                minIncomingLiquidityGaugeTokenAmount,
                true
            );
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
            WETH_TOKEN
        );
    }

    /// @notice Lends assets for LP tokens
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
            uint256[3] memory orderedOutgoingAmounts,
            uint256 minIncomingLPTokenAmount,
            bool useUnderlyings
        ) = __decodeLendCallArgs(_encodedCallArgs);

        __curveAaveLend(orderedOutgoingAmounts, minIncomingLPTokenAmount, useUnderlyings);
    }

    /// @notice Lends assets for LP tokens, then stakes the received LP tokens
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
            uint256[3] memory orderedOutgoingAmounts,
            uint256 minIncomingLiquidityGaugeTokenAmount,
            bool useUnderlyings
        ) = __decodeLendCallArgs(_encodedCallArgs);

        __curveAaveLend(
            orderedOutgoingAmounts,
            minIncomingLiquidityGaugeTokenAmount,
            useUnderlyings
        );
        __curveGaugeV2Stake(
            LIQUIDITY_GAUGE_TOKEN,
            LP_TOKEN,
            ERC20(LP_TOKEN).balanceOf(address(this))
        );
    }

    /// @notice Redeems LP tokens
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
            uint256 outgoingLPTokenAmount,
            uint256[3] memory orderedMinIncomingAssetAmounts,
            bool redeemSingleAsset,
            bool useUnderlyings
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __curveAaveRedeem(
            outgoingLPTokenAmount,
            orderedMinIncomingAssetAmounts,
            redeemSingleAsset,
            useUnderlyings
        );
    }

    /// @notice Stakes LP tokens
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
        uint256 outgoingLPTokenAmount = __decodeStakeCallArgs(_encodedCallArgs);

        __curveGaugeV2Stake(LIQUIDITY_GAUGE_TOKEN, LP_TOKEN, outgoingLPTokenAmount);
    }

    /// @notice Unstakes LP tokens
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
        uint256 outgoingLiquidityGaugeTokenAmount = __decodeUnstakeCallArgs(_encodedCallArgs);

        __curveGaugeV2Unstake(LIQUIDITY_GAUGE_TOKEN, outgoingLiquidityGaugeTokenAmount);
    }

    /// @notice Unstakes LP tokens, then redeems them
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
            uint256[3] memory orderedMinIncomingAssetAmounts,
            bool redeemSingleAsset,
            bool useUnderlyings
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __curveGaugeV2Unstake(LIQUIDITY_GAUGE_TOKEN, outgoingLiquidityGaugeTokenAmount);
        __curveAaveRedeem(
            outgoingLiquidityGaugeTokenAmount,
            orderedMinIncomingAssetAmounts,
            redeemSingleAsset,
            useUnderlyings
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
        (
            ,
            uint256 minIncomingLiquidityGaugeTokenAmount,
            uint8 intermediaryUnderlyingAssetIndex
        ) = __decodeClaimRewardsAndReinvestCallArgs(_encodedCallArgs);
        require(
            intermediaryUnderlyingAssetIndex < 3,
            "__parseAssetsForClaimRewardsAndReinvest: Out-of-bounds intermediaryUnderlyingAssetIndex"
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
            uint256[3] memory orderedOutgoingAssetAmounts,
            uint256 minIncomingLpTokenAmount,
            bool useUnderlyings
        ) = __decodeLendCallArgs(_encodedCallArgs);

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            orderedOutgoingAssetAmounts,
            useUnderlyings
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
            uint256[3] memory orderedOutgoingAssetAmounts,
            uint256 minIncomingLiquidityGaugeTokenAmount,
            bool useUnderlyings
        ) = __decodeLendCallArgs(_encodedCallArgs);

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            orderedOutgoingAssetAmounts,
            useUnderlyings
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
            uint256[3] memory orderedMinIncomingAssetAmounts,
            bool receiveSingleAsset,
            bool useUnderlyings
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = LP_TOKEN;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLpTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            orderedMinIncomingAssetAmounts,
            receiveSingleAsset,
            useUnderlyings
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
            uint256[3] memory orderedMinIncomingAssetAmounts,
            bool receiveSingleAsset,
            bool useUnderlyings
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = LIQUIDITY_GAUGE_TOKEN;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLiquidityGaugeTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            orderedMinIncomingAssetAmounts,
            receiveSingleAsset,
            useUnderlyings
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
        uint256[3] memory _orderedMinIncomingAssetAmounts,
        bool _receiveSingleAsset,
        bool _useUnderlyings
    )
        private
        view
        returns (address[] memory incomingAssets_, uint256[] memory minIncomingAssetAmounts_)
    {
        if (_receiveSingleAsset) {
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);

            for (uint256 i; i < _orderedMinIncomingAssetAmounts.length; i++) {
                if (_orderedMinIncomingAssetAmounts[i] == 0) {
                    continue;
                }

                // Validate that only one min asset amount is set
                for (uint256 j = i + 1; j < _orderedMinIncomingAssetAmounts.length; j++) {
                    require(
                        _orderedMinIncomingAssetAmounts[j] == 0,
                        "__parseIncomingAssetsForRedemptionCalls: Too many min asset amounts specified"
                    );
                }

                incomingAssets_[0] = getAssetByPoolIndex(i, _useUnderlyings);
                minIncomingAssetAmounts_[0] = _orderedMinIncomingAssetAmounts[i];

                break;
            }
            require(
                incomingAssets_[0] != address(0),
                "__parseIncomingAssetsForRedemptionCalls: No min asset amount"
            );
        } else {
            incomingAssets_ = new address[](3);
            minIncomingAssetAmounts_ = new uint256[](3);
            for (uint256 i; i < incomingAssets_.length; i++) {
                incomingAssets_[i] = getAssetByPoolIndex(i, _useUnderlyings);
                minIncomingAssetAmounts_[i] = _orderedMinIncomingAssetAmounts[i];
            }
        }

        return (incomingAssets_, minIncomingAssetAmounts_);
    }

    /// @dev Helper function to parse spend assets for lend() and lendAndStake() calls
    function __parseSpendAssetsForLendingCalls(
        uint256[3] memory _orderedOutgoingAssetAmounts,
        bool _useUnderlyings
    ) private view returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_) {
        uint256 spendAssetsCount;
        for (uint256 i; i < _orderedOutgoingAssetAmounts.length; i++) {
            if (_orderedOutgoingAssetAmounts[i] > 0) {
                spendAssetsCount++;
            }
        }

        spendAssets_ = new address[](spendAssetsCount);
        spendAssetAmounts_ = new uint256[](spendAssetsCount);
        uint256 spendAssetsIndex;
        for (uint256 i; i < _orderedOutgoingAssetAmounts.length; i++) {
            if (_orderedOutgoingAssetAmounts[i] > 0) {
                spendAssets_[spendAssetsIndex] = getAssetByPoolIndex(i, _useUnderlyings);
                spendAssetAmounts_[spendAssetsIndex] = _orderedOutgoingAssetAmounts[i];
                spendAssetsIndex++;
            }
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

    /// @dev Helper to decode the encoded call arguments for claiming rewards and reinvesting
    function __decodeClaimRewardsAndReinvestCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            bool useFullBalances_,
            uint256 minIncomingLiquidityGaugeTokenAmount_,
            uint8 intermediaryUnderlyingAssetIndex_
        )
    {
        return abi.decode(_encodedCallArgs, (bool, uint256, uint8));
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
            uint256[3] memory orderedOutgoingAmounts_,
            uint256 minIncomingAssetAmount_,
            bool useUnderlyings_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256[3], uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for redeeming.
    /// If `receiveSingleAsset_` is `true`, then one (and only one) of
    /// the orderedMinIncomingAmounts_ must be >0 to indicate which asset is to be received.
    function __decodeRedeemCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingAssetAmount_,
            uint256[3] memory orderedMinIncomingAmounts_,
            bool receiveSingleAsset_,
            bool useUnderlyings_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256[3], bool, bool));
    }

    /// @dev Helper to decode the encoded call arguments for staking
    function __decodeStakeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 outgoingLPTokenAmount_)
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

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }

    /// @notice Gets an asset by its pool index and whether or not to use the underlying
    /// instead of the aToken
    function getAssetByPoolIndex(uint256 _index, bool _useUnderlying)
        public
        view
        returns (address asset_)
    {
        if (_index == 0) {
            if (_useUnderlying) {
                return DAI_TOKEN;
            }
            return AAVE_DAI_TOKEN;
        } else if (_index == 1) {
            if (_useUnderlying) {
                return USDC_TOKEN;
            }
            return AAVE_USDC_TOKEN;
        } else if (_index == 2) {
            if (_useUnderlying) {
                return USDT_TOKEN;
            }
            return AAVE_USDT_TOKEN;
        }
    }
}
