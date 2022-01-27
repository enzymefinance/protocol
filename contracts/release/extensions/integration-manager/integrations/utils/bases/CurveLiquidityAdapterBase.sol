// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../../../../interfaces/ICurveRegistry.sol";
import "../actions/CurveLiquidityActionsMixin.sol";
import "../AdapterBase.sol";

/// @title CurveLiquidityAdapterBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base adapter for liquidity provision in Curve pools that adhere to pool templates,
/// as well as some old pools that have almost the same required interface (e.g., 3pool).
/// Implementing contracts can allow staking via Curve gauges, Convex, etc.
abstract contract CurveLiquidityAdapterBase is AdapterBase, CurveLiquidityActionsMixin {
    enum RedeemType {Standard, OneCoin}

    address private constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address private immutable ADDRESS_PROVIDER;

    constructor(
        address _integrationManager,
        address _addressProvider,
        address _wrappedNativeAsset
    ) public AdapterBase(_integrationManager) CurveLiquidityActionsMixin(_wrappedNativeAsset) {
        ADDRESS_PROVIDER = _addressProvider;
    }

    /// @dev Needed to unwrap and receive the native asset
    receive() external payable {}

    // INTERNAL FUNCTIONS

    /// @dev Helper to return the wrappedNativeAsset if the input is the native asset
    function __castWrappedIfNativeAsset(address _tokenOrNativeAsset)
        internal
        view
        returns (address token_)
    {
        if (_tokenOrNativeAsset == ETH_ADDRESS) {
            return getCurveLiquidityWrappedNativeAsset();
        }

        return _tokenOrNativeAsset;
    }

    /// @dev Helper to correctly call the relevant redeem function based on RedeemType
    function __curveRedeem(
        address _pool,
        uint256 _outgoingLpTokenAmount,
        bool _useUnderlyings,
        RedeemType _redeemType,
        bytes memory _incomingAssetsData
    ) internal {
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

    /// @dev Helper function to parse spend assets for redeem() and unstakeAndRedeem() calls
    function __parseIncomingAssetsForRedemptionCalls(
        address _curveRegistry,
        address _pool,
        bool _useUnderlyings,
        RedeemType _redeemType,
        bytes memory _incomingAssetsData
    )
        internal
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
    ) internal view returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_) {
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
        for (uint256 i; i < _orderedOutgoingAssetAmounts.length; i++) {
            if (_orderedOutgoingAssetAmounts[i] > 0) {
                spendAssets_[spendAssetsIndex] = __castWrappedIfNativeAsset(
                    canonicalPoolAssets[i]
                );
                spendAssetAmounts_[spendAssetsIndex] = _orderedOutgoingAssetAmounts[i];
                spendAssetsIndex++;

                if (spendAssetsIndex == spendAssetsCount) {
                    break;
                }
            }
        }

        return (spendAssets_, spendAssetAmounts_);
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    // Some of these decodings are not relevant to inheriting contracts,
    // and some parameters will be ignored, but this keeps the payloads
    // consistent for all inheriting adapters.

    /// @dev Helper to decode the encoded call arguments for claiming rewards
    function __decodeClaimRewardsCallArgs(bytes memory _actionData)
        internal
        pure
        returns (address stakingToken_)
    {
        return abi.decode(_actionData, (address));
    }

    /// @dev Helper to decode the encoded call arguments for lending and then staking
    function __decodeLendAndStakeCallArgs(bytes memory _actionData)
        internal
        pure
        returns (
            address pool_,
            uint256[] memory orderedOutgoingAssetAmounts_,
            address incomingStakingToken_,
            uint256 minIncomingStakingTokenAmount_,
            bool useUnderlyings_
        )
    {
        return abi.decode(_actionData, (address, uint256[], address, uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for lending
    function __decodeLendCallArgs(bytes memory _actionData)
        internal
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
        internal
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
        internal
        pure
        returns (uint256 incomingAssetPoolIndex_, uint256 minIncomingAssetAmount_)
    {
        return abi.decode(_incomingAssetsData, (uint256, uint256));
    }

    /// @dev Helper to decode the encoded incoming assets arguments for RedeemType.Standard
    function __decodeIncomingAssetsDataRedeemStandard(bytes memory _incomingAssetsData)
        internal
        pure
        returns (uint256[] memory orderedMinIncomingAssetAmounts_)
    {
        return abi.decode(_incomingAssetsData, (uint256[]));
    }

    /// @dev Helper to decode the encoded call arguments for staking
    function __decodeStakeCallArgs(bytes memory _actionData)
        internal
        pure
        returns (
            address pool_,
            address incomingStakingToken_,
            uint256 amount_
        )
    {
        return abi.decode(_actionData, (address, address, uint256));
    }

    /// @dev Helper to decode the encoded call arguments for unstaking and then redeeming
    function __decodeUnstakeAndRedeemCallArgs(bytes memory _actionData)
        internal
        pure
        returns (
            address pool_,
            address outgoingStakingToken_,
            uint256 outgoingStakingTokenAmount_,
            bool useUnderlyings_,
            RedeemType redeemType_,
            bytes memory incomingAssetsData_
        )
    {
        return abi.decode(_actionData, (address, address, uint256, bool, RedeemType, bytes));
    }

    /// @dev Helper to decode the encoded call arguments for unstaking
    function __decodeUnstakeCallArgs(bytes memory _actionData)
        internal
        pure
        returns (
            address pool_,
            address outgoingStakingToken_,
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
