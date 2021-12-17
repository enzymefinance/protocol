// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../../../interfaces/ICurveAddressProvider.sol";
import "../../../../interfaces/ICurveRegistry.sol";
import "../utils/actions/CurveGaugeV2RewardsHandlerBase.sol";
import "../utils/actions/CurveLiquidityActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title CurveLiquidityAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for liquidity provision in Curve pools that adhere to pool templates,
/// as well as some old pools that have almost the same required interface (e.g., 3pool)
/// @dev Rewards tokens are not included as spend assets or incoming assets for claimRewards()
/// Rationale:
/// - rewards tokens can be claimed to the vault outside of the IntegrationManager, so no need
/// to enforce policy management or emit an event
/// - rewards tokens can be outside of the asset universe, in which case they cannot be tracked
contract CurveLiquidityAdapter is
    AdapterBase,
    CurveGaugeV2RewardsHandlerBase,
    CurveLiquidityActionsMixin
{
    enum RedeemType {Standard, OneCoin}

    address private constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address private immutable ADDRESS_PROVIDER;

    constructor(
        address _integrationManager,
        address _addressProvider,
        address _minter,
        address _crvToken,
        address _wrappedNativeAsset
    )
        public
        AdapterBase(_integrationManager)
        CurveGaugeV2RewardsHandlerBase(_minter, _crvToken)
        CurveLiquidityActionsMixin(_wrappedNativeAsset)
    {
        ADDRESS_PROVIDER = _addressProvider;
    }

    /// @dev Needed to unwrap and receive the native asset
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Claims rewards from the Curve Minter as well as pool-specific rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @dev Pool must have an ERC20 liquidity gauge (e.g., v2, v3, v4) or an ERC20 wrapper (e.g., v1)
    function claimRewards(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        __curveGaugeV2ClaimAllRewards(__decodeClaimRewardsCallArgs(_actionData), _vaultProxy);
    }

    /// @notice Lends assets for LP tokens (not staked)
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
            address pool,
            uint256[] memory orderedOutgoingAssetAmounts,
            uint256 minIncomingLpTokenAmount,
            bool useUnderlyings
        ) = __decodeLendCallArgs(_actionData);
        (address[] memory spendAssets, , ) = __decodeAssetData(_assetData);

        __curveAddLiquidity(
            pool,
            spendAssets,
            orderedOutgoingAssetAmounts,
            minIncomingLpTokenAmount,
            useUnderlyings
        );
    }

    /// @notice Lends assets for LP tokens, then stakes the received LP tokens
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
            address pool,
            uint256[] memory orderedOutgoingAssetAmounts,
            address incomingGaugeToken,
            uint256 minIncomingGaugeTokenAmount,
            bool useUnderlyings
        ) = __decodeLendAndStakeCallArgs(_actionData);
        (address[] memory spendAssets, , ) = __decodeAssetData(_assetData);

        // Pool already validated by validating the gauge
        address lpToken = ICurveRegistry(
            ICurveAddressProvider(getAddressProvider()).get_registry()
        )
            .get_lp_token(pool);

        __curveAddLiquidity(
            pool,
            spendAssets,
            orderedOutgoingAssetAmounts,
            minIncomingGaugeTokenAmount,
            useUnderlyings
        );
        __curveGaugeV2Stake(incomingGaugeToken, lpToken, ERC20(lpToken).balanceOf(address(this)));
    }

    /// @notice Redeems LP tokens
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
            address pool,
            uint256 outgoingLpTokenAmount,
            bool useUnderlyings,
            RedeemType redeemType,
            bytes memory incomingAssetsData
        ) = __decodeRedeemCallArgs(_actionData);

        __redeem(pool, outgoingLpTokenAmount, useUnderlyings, redeemType, incomingAssetsData);
    }

    /// @notice Stakes LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function stake(
        address _vaultProxy,
        bytes calldata,
        bytes calldata _assetData
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = __decodeAssetData(_assetData);

        __curveGaugeV2Stake(incomingAssets[0], spendAssets[0], spendAssetAmounts[0]);
    }

    /// @notice Unstakes LP tokens
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
        (, address outgoingGaugeToken, uint256 amount) = __decodeUnstakeCallArgs(_actionData);

        __curveGaugeV2Unstake(outgoingGaugeToken, amount);
    }

    /// @notice Unstakes LP tokens, then redeems them
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
            address pool,
            address outgoingGaugeToken,
            uint256 outgoingGaugeTokenAmount,
            bool useUnderlyings,
            RedeemType redeemType,
            bytes memory incomingAssetsData
        ) = __decodeUnstakeAndRedeemCallArgs(_actionData);

        __curveGaugeV2Unstake(outgoingGaugeToken, outgoingGaugeTokenAmount);

        __redeem(pool, outgoingGaugeTokenAmount, useUnderlyings, redeemType, incomingAssetsData);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to return the wrappedNativeAsset if the input is the native asset
    function __castWrappedIfNativeAsset(address _tokenOrNativeAsset)
        private
        view
        returns (address token_)
    {
        if (_tokenOrNativeAsset == ETH_ADDRESS) {
            return getCurveLiquidityWrappedNativeAsset();
        }

        return _tokenOrNativeAsset;
    }

    /// @dev Helper to correctly call the relevant redeem function based on RedeemType
    function __redeem(
        address _pool,
        uint256 _outgoingLpTokenAmount,
        bool _useUnderlyings,
        RedeemType _redeemType,
        bytes memory _incomingAssetsData
    ) private {
        if (_redeemType == RedeemType.OneCoin) {
            (
                uint256 incomingAssetPoolIndex,
                uint256 minIncomingAssetAmount
            ) = __decodeIncomingAssetsDataRedeemOneCoin(_incomingAssetsData);

            __curveRemoveLiquidityOneCoin(
                _pool,
                _outgoingLpTokenAmount,
                int128(incomingAssetPoolIndex),
                minIncomingAssetAmount,
                _useUnderlyings
            );
        } else {
            __curveRemoveLiquidity(
                _pool,
                _outgoingLpTokenAmount,
                __decodeIncomingAssetsDataRedeemStandard(_incomingAssetsData),
                _useUnderlyings
            );
        }
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
            address pool,
            uint256[] memory orderedOutgoingAssetAmounts,
            uint256 minIncomingLpTokenAmount,
            bool useUnderlyings
        ) = __decodeLendCallArgs(_actionData);

        address curveRegistry = ICurveAddressProvider(getAddressProvider()).get_registry();

        address lpToken = ICurveRegistry(curveRegistry).get_lp_token(pool);
        require(lpToken != address(0), "__parseAssetsForLend: Invalid pool");

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = lpToken;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingLpTokenAmount;

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            curveRegistry,
            pool,
            orderedOutgoingAssetAmounts,
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
            address incomingGaugeToken,
            uint256 minIncomingGaugeTokenAmount,
            bool useUnderlyings
        ) = __decodeLendAndStakeCallArgs(_actionData);

        address curveRegistry = ICurveAddressProvider(getAddressProvider()).get_registry();

        __validateGauge(curveRegistry, pool, incomingGaugeToken);

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForLendingCalls(
            curveRegistry,
            pool,
            orderedOutgoingAssetAmounts,
            useUnderlyings
        );

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingGaugeToken;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingGaugeTokenAmount;

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
            address pool,
            uint256 outgoingLpTokenAmount,
            bool useUnderlyings,
            RedeemType redeemType,
            bytes memory incomingAssetsData
        ) = __decodeRedeemCallArgs(_actionData);

        address curveRegistry = ICurveAddressProvider(getAddressProvider()).get_registry();
        address lpToken = ICurveRegistry(curveRegistry).get_lp_token(pool);
        require(lpToken != address(0), "__parseAssetsForRedeem: Invalid pool");

        spendAssets_ = new address[](1);
        spendAssets_[0] = lpToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingLpTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            curveRegistry,
            pool,
            useUnderlyings,
            redeemType,
            incomingAssetsData
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
        (address pool, address incomingGaugeToken, uint256 amount) = __decodeStakeCallArgs(
            _actionData
        );

        // No need to validate pool at this point, as the gauge is validated below
        address curveRegistry = ICurveAddressProvider(getAddressProvider()).get_registry();
        address lpToken = ICurveRegistry(curveRegistry).get_lp_token(pool);

        __validateGauge(curveRegistry, pool, incomingGaugeToken);

        spendAssets_ = new address[](1);
        spendAssets_[0] = lpToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingGaugeToken;

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
        (address pool, address outgoingGaugeToken, uint256 amount) = __decodeUnstakeCallArgs(
            _actionData
        );

        // No need to validate pool at this point, as the gauge is validated below
        address curveRegistry = ICurveAddressProvider(getAddressProvider()).get_registry();
        address lpToken = ICurveRegistry(curveRegistry).get_lp_token(pool);

        __validateGauge(curveRegistry, pool, outgoingGaugeToken);

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingGaugeToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = lpToken;

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
            address outgoingGaugeToken,
            uint256 outgoingGaugeTokenAmount,
            bool useUnderlyings,
            RedeemType redeemType,
            bytes memory incomingAssetsData
        ) = __decodeUnstakeAndRedeemCallArgs(_actionData);

        address curveRegistry = ICurveAddressProvider(getAddressProvider()).get_registry();

        __validateGauge(curveRegistry, pool, outgoingGaugeToken);

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingGaugeToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingGaugeTokenAmount;

        (incomingAssets_, minIncomingAssetAmounts_) = __parseIncomingAssetsForRedemptionCalls(
            curveRegistry,
            pool,
            useUnderlyings,
            redeemType,
            incomingAssetsData
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
        address _curveRegistry,
        address _pool,
        bool _useUnderlyings,
        RedeemType _redeemType,
        bytes memory _incomingAssetsData
    )
        private
        view
        returns (address[] memory incomingAssets_, uint256[] memory minIncomingAssetAmounts_)
    {
        address[8] memory canonicalPoolAssets;
        if (_useUnderlyings) {
            canonicalPoolAssets = ICurveRegistry(_curveRegistry).get_underlying_coins(_pool);
        } else {
            canonicalPoolAssets = ICurveRegistry(_curveRegistry).get_coins(_pool);
        }

        if (_redeemType == RedeemType.OneCoin) {
            (
                uint256 incomingAssetPoolIndex,
                uint256 minIncomingAssetAmount
            ) = __decodeIncomingAssetsDataRedeemOneCoin(_incomingAssetsData);

            // No need to validate incomingAssetPoolIndex,
            // as an out-of-bounds index will fail in the call to Curve
            incomingAssets_ = new address[](1);
            incomingAssets_[0] = __castWrappedIfNativeAsset(
                canonicalPoolAssets[incomingAssetPoolIndex]
            );

            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minIncomingAssetAmount;
        } else {
            minIncomingAssetAmounts_ = __decodeIncomingAssetsDataRedeemStandard(
                _incomingAssetsData
            );

            // No need to validate minIncomingAssetAmounts_.length,
            // as an incorrect length will fail with the wrong n_tokens in the call to Curve
            incomingAssets_ = new address[](minIncomingAssetAmounts_.length);
            for (uint256 i; i < incomingAssets_.length; i++) {
                incomingAssets_[i] = __castWrappedIfNativeAsset(canonicalPoolAssets[i]);
            }
        }

        return (incomingAssets_, minIncomingAssetAmounts_);
    }

    /// @dev Helper function to parse spend assets for lend() and lendAndStake() calls
    function __parseSpendAssetsForLendingCalls(
        address _curveRegistry,
        address _pool,
        uint256[] memory _orderedOutgoingAssetAmounts,
        bool _useUnderlyings
    ) private view returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_) {
        address[8] memory canonicalPoolAssets;
        if (_useUnderlyings) {
            canonicalPoolAssets = ICurveRegistry(_curveRegistry).get_underlying_coins(_pool);
        } else {
            canonicalPoolAssets = ICurveRegistry(_curveRegistry).get_coins(_pool);
        }

        uint256 spendAssetsCount;
        for (uint256 i; i < _orderedOutgoingAssetAmounts.length; i++) {
            if (_orderedOutgoingAssetAmounts[i] > 0) {
                spendAssetsCount++;
            }
        }

        spendAssets_ = new address[](spendAssetsCount);
        spendAssetAmounts_ = new uint256[](spendAssetsCount);
        uint256 spendAssetsIndex;
        while (spendAssetsIndex < spendAssetsCount) {
            for (uint256 i; i < _orderedOutgoingAssetAmounts.length; i++) {
                if (_orderedOutgoingAssetAmounts[i] > 0) {
                    spendAssets_[spendAssetsIndex] = __castWrappedIfNativeAsset(
                        canonicalPoolAssets[i]
                    );
                    spendAssetAmounts_[spendAssetsIndex] = _orderedOutgoingAssetAmounts[i];
                    spendAssetsIndex++;
                }
            }
        }

        return (spendAssets_, spendAssetAmounts_);
    }

    /// @dev Helper to validate a user-input liquidity gauge
    function __validateGauge(
        address _curveRegistry,
        address _pool,
        address _gauge
    ) private view {
        require(_gauge != address(0), "__validateGauge: Empty gauge");
        (address[10] memory gauges, ) = ICurveRegistry(_curveRegistry).get_gauges(_pool);
        bool isValid;
        for (uint256 i; i < gauges.length; i++) {
            if (_gauge == gauges[i]) {
                isValid = true;
                break;
            }
        }
        require(isValid, "__validateGauge: Invalid gauge");
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    /// @dev Helper to decode the encoded call arguments for claiming rewards
    function __decodeClaimRewardsCallArgs(bytes memory _actionData)
        private
        pure
        returns (address gaugeToken_)
    {
        return abi.decode(_actionData, (address));
    }

    /// @dev Helper to decode the encoded call arguments for lending and then staking
    function __decodeLendAndStakeCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address pool_,
            uint256[] memory orderedOutgoingAssetAmounts_,
            address incomingGaugeToken_,
            uint256 minIncomingGaugeTokenAmount_,
            bool useUnderlyings_
        )
    {
        return abi.decode(_actionData, (address, uint256[], address, uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for lending
    function __decodeLendCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address pool_,
            uint256[] memory orderedOutgoingAssetAmounts_,
            uint256 minIncomingLpTokenAmount_,
            bool useUnderlyings_
        )
    {
        return abi.decode(_actionData, (address, uint256[], uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for redeeming
    function __decodeRedeemCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address pool_,
            uint256 outgoingLpTokenAmount_,
            bool useUnderlyings_,
            RedeemType redeemType_,
            bytes memory incomingAssetsData_
        )
    {
        return abi.decode(_actionData, (address, uint256, bool, RedeemType, bytes));
    }

    /// @dev Helper to decode the encoded incoming assets arguments for RedeemType.OneCoin
    function __decodeIncomingAssetsDataRedeemOneCoin(bytes memory _incomingAssetsData)
        private
        pure
        returns (uint256 incomingAssetPoolIndex_, uint256 minIncomingAssetAmount_)
    {
        return abi.decode(_incomingAssetsData, (uint256, uint256));
    }

    /// @dev Helper to decode the encoded incoming assets arguments for RedeemType.Standard
    function __decodeIncomingAssetsDataRedeemStandard(bytes memory _incomingAssetsData)
        private
        pure
        returns (uint256[] memory orderedMinIncomingAssetAmounts_)
    {
        return abi.decode(_incomingAssetsData, (uint256[]));
    }

    /// @dev Helper to decode the encoded call arguments for staking
    function __decodeStakeCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address pool_,
            address incomingGaugeToken_,
            uint256 amount_
        )
    {
        return abi.decode(_actionData, (address, address, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for unstaking and then redeeming
    function __decodeUnstakeAndRedeemCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address pool_,
            address outgoingGaugeToken_,
            uint256 outgoingGaugeTokenAmount_,
            bool useUnderlyings_,
            RedeemType redeemType_,
            bytes memory incomingAssetsData_
        )
    {
        return abi.decode(_actionData, (address, address, uint256, bool, RedeemType, bytes));
    }

    /// @dev Helper to decode the encoded call arguments for unstaking
    function __decodeUnstakeCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address pool_,
            address outgoingGaugeToken_,
            uint256 amount_
        )
    {
        return abi.decode(_actionData, (address, address, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ADDRESS_PROVIDER` variable
    /// @return addressProvider_ The `ADDRESS_PROVIDER` variable value
    function getAddressProvider() public view returns (address addressProvider_) {
        return ADDRESS_PROVIDER;
    }
}
