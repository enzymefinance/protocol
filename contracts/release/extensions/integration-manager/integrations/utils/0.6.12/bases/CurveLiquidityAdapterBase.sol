// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../../../../../../external-interfaces/ICurveLiquidityPool.sol";
import "../actions/CurveLiquidityActionsMixin.sol";
import "../AdapterBase.sol";

/// @title CurveLiquidityAdapterBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base adapter for liquidity provision in Curve pools that adhere to pool templates,
/// as well as some old pools that have almost the same required interface (e.g., 3pool).
/// Implementing contracts can allow staking via Curve gauges, Convex, etc.
abstract contract CurveLiquidityAdapterBase is AdapterBase, CurveLiquidityActionsMixin {
    enum RedeemType {
        Standard,
        OneCoin
    }

    address private immutable CURVE_LIQUIDITY_NATIVE_ASSET_ADDRESS;

    constructor(address _integrationManager, address _wrappedNativeAsset, address _nativeAssetAddress)
        public
        AdapterBase(_integrationManager)
        CurveLiquidityActionsMixin(_wrappedNativeAsset)
    {
        CURVE_LIQUIDITY_NATIVE_ASSET_ADDRESS = _nativeAssetAddress;
    }

    /// @dev Needed to unwrap and receive the native asset
    receive() external payable {}

    // INTERNAL FUNCTIONS

    /// @dev Helper to return the wrappedNativeAsset if the input is the native asset
    function __castWrappedIfNativeAsset(address _tokenOrNativeAsset) internal view returns (address token_) {
        if (_tokenOrNativeAsset == CURVE_LIQUIDITY_NATIVE_ASSET_ADDRESS) {
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
            (uint256 incomingAssetPoolIndex, uint256 minIncomingAssetAmount) =
                __decodeIncomingAssetsDataRedeemOneCoin(_incomingAssetsData);

            __curveRemoveLiquidityOneCoin(
                _pool, _outgoingLpTokenAmount, int128(incomingAssetPoolIndex), minIncomingAssetAmount, _useUnderlyings
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
        address _pool,
        bool _useUnderlyings,
        RedeemType _redeemType,
        bytes memory _incomingAssetsData
    ) internal view returns (address[] memory incomingAssets_, uint256[] memory minIncomingAssetAmounts_) {
        if (_redeemType == RedeemType.OneCoin) {
            (uint256 incomingAssetPoolIndex, uint256 minIncomingAssetAmount) =
                __decodeIncomingAssetsDataRedeemOneCoin(_incomingAssetsData);

            // No need to validate incomingAssetPoolIndex,
            // as an out-of-bounds index will fail in the call to Curve
            incomingAssets_ = new address[](1);
            incomingAssets_[0] = __getPoolAsset(_pool, incomingAssetPoolIndex, _useUnderlyings);

            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minIncomingAssetAmount;
        } else {
            minIncomingAssetAmounts_ = __decodeIncomingAssetsDataRedeemStandard(_incomingAssetsData);

            // No need to validate minIncomingAssetAmounts_.length,
            // as an incorrect length will fail with the wrong n_tokens in the call to Curve
            incomingAssets_ = new address[](minIncomingAssetAmounts_.length);
            for (uint256 i; i < incomingAssets_.length; i++) {
                incomingAssets_[i] = __getPoolAsset(_pool, i, _useUnderlyings);
            }
        }

        return (incomingAssets_, minIncomingAssetAmounts_);
    }

    /// @dev Helper function to parse spend assets for lend() and lendAndStake() calls
    function __parseSpendAssetsForLendingCalls(
        address _pool,
        uint256[] memory _orderedOutgoingAssetAmounts,
        bool _useUnderlyings
    ) internal view returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_) {
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
                spendAssets_[spendAssetsIndex] = __getPoolAsset(_pool, i, _useUnderlyings);
                spendAssetAmounts_[spendAssetsIndex] = _orderedOutgoingAssetAmounts[i];
                spendAssetsIndex++;

                if (spendAssetsIndex == spendAssetsCount) {
                    break;
                }
            }
        }

        return (spendAssets_, spendAssetAmounts_);
    }

    /// @dev Helper to get a pool asset at a given index
    function __getPoolAsset(address _pool, uint256 _index, bool _useUnderlying)
        internal
        view
        returns (address asset_)
    {
        if (_useUnderlying) {
            try ICurveLiquidityPool(_pool).underlying_coins(_index) returns (address underlyingCoin) {
                asset_ = underlyingCoin;
            } catch {
                asset_ = ICurveLiquidityPool(_pool).underlying_coins(int128(_index));
            }
        } else {
            try ICurveLiquidityPool(_pool).coins(_index) returns (address coin) {
                asset_ = coin;
            } catch {
                asset_ = ICurveLiquidityPool(_pool).coins(int128(_index));
            }
        }

        return __castWrappedIfNativeAsset(asset_);
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    // Some of these decodings are not relevant to inheriting contracts,
    // and some parameters will be ignored, but this keeps the payloads
    // consistent for all inheriting adapters.

    /// @dev Helper to decode the encoded call arguments for claiming rewards
    function __decodeClaimRewardsCallArgs(bytes memory _actionData) internal pure returns (address stakingToken_) {
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
        returns (address pool_, address incomingStakingToken_, uint256 amount_)
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
        returns (address pool_, address outgoingStakingToken_, uint256 amount_)
    {
        return abi.decode(_actionData, (address, address, uint256));
    }
}
