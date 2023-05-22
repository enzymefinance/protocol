// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Strings.sol";
import "../../../../../../external-interfaces/IWETH.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title CurveLiquidityActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Curve pool liquidity functions
/// @dev Inheriting contract must have a receive() function if lending or redeeming for the native asset
abstract contract CurveLiquidityActionsMixin is AssetHelpers {
    using Strings for uint256;

    uint256 private constant ASSET_APPROVAL_TOP_UP_THRESHOLD = 1e76; // Arbitrary, slightly less than 1/11 of max uint256

    bytes4 private constant CURVE_REMOVE_LIQUIDITY_ONE_COIN_SELECTOR = 0x1a4d01d2;
    bytes4 private constant CURVE_REMOVE_LIQUIDITY_ONE_COIN_USE_UNDERLYINGS_SELECTOR = 0x517a55a3;

    address private immutable CURVE_LIQUIDITY_WRAPPED_NATIVE_ASSET;

    constructor(address _wrappedNativeAsset) public {
        CURVE_LIQUIDITY_WRAPPED_NATIVE_ASSET = _wrappedNativeAsset;
    }

    /// @dev Helper to add liquidity to the pool.
    /// _squashedOutgoingAssets are only those pool assets that are actually used to add liquidity,
    /// which can be verbose and ordered, but it is more gas-efficient to only include non-0 amounts.
    function __curveAddLiquidity(
        address _pool,
        address[] memory _squashedOutgoingAssets,
        uint256[] memory _orderedOutgoingAssetAmounts,
        uint256 _minIncomingLpTokenAmount,
        bool _useUnderlyings
    ) internal {
        // Approve and/or unwrap native asset as necessary.
        // Rather than using exact amounts for approvals,
        // this tops up to max approval if 1/2 max is reached.
        uint256 outgoingNativeAssetAmount;
        for (uint256 i; i < _squashedOutgoingAssets.length; i++) {
            if (_squashedOutgoingAssets[i] == getCurveLiquidityWrappedNativeAsset()) {
                // It is never the case that a pool has multiple slots for the same native asset,
                // so this is not additive
                outgoingNativeAssetAmount = ERC20(getCurveLiquidityWrappedNativeAsset()).balanceOf(
                        address(this)
                    );
                IWETH(getCurveLiquidityWrappedNativeAsset()).withdraw(outgoingNativeAssetAmount);
            } else {
                // Once an asset it approved for a given pool, it will almost definitely
                // never need approval again, but it is topped up to max once an arbitrary
                // threshold is reached
                __approveAssetMaxAsNeeded(
                    _squashedOutgoingAssets[i],
                    _pool,
                    ASSET_APPROVAL_TOP_UP_THRESHOLD
                );
            }
        }

        // Dynamically call the appropriate selector
        (bool success, bytes memory returnData) = _pool.call{value: outgoingNativeAssetAmount}(
            __curveAddLiquidityEncodeCalldata(
                _orderedOutgoingAssetAmounts,
                _minIncomingLpTokenAmount,
                _useUnderlyings
            )
        );
        require(success, string(returnData));
    }

    /// @dev Helper to remove liquidity from the pool.
    /// if using _redeemSingleAsset, must pre-validate that one - and only one - asset
    /// has a non-zero _orderedMinIncomingAssetAmounts value.
    function __curveRemoveLiquidity(
        address _pool,
        uint256 _outgoingLpTokenAmount,
        uint256[] memory _orderedMinIncomingAssetAmounts,
        bool _useUnderlyings
    ) internal {
        // Dynamically call the appropriate selector
        (bool success, bytes memory returnData) = _pool.call(
            __curveRemoveLiquidityEncodeCalldata(
                _outgoingLpTokenAmount,
                _orderedMinIncomingAssetAmounts,
                _useUnderlyings
            )
        );
        require(success, string(returnData));

        // Wrap native asset
        __curveLiquidityWrapNativeAssetBalance();
    }

    /// @dev Helper to remove liquidity from the pool and receive all value owed in one specified token
    function __curveRemoveLiquidityOneCoin(
        address _pool,
        uint256 _outgoingLpTokenAmount,
        int128 _incomingAssetPoolIndex,
        uint256 _minIncomingAssetAmount,
        bool _useUnderlyings
    ) internal {
        bytes memory callData;
        if (_useUnderlyings) {
            callData = abi.encodeWithSelector(
                CURVE_REMOVE_LIQUIDITY_ONE_COIN_USE_UNDERLYINGS_SELECTOR,
                _outgoingLpTokenAmount,
                _incomingAssetPoolIndex,
                _minIncomingAssetAmount,
                true
            );
        } else {
            callData = abi.encodeWithSelector(
                CURVE_REMOVE_LIQUIDITY_ONE_COIN_SELECTOR,
                _outgoingLpTokenAmount,
                _incomingAssetPoolIndex,
                _minIncomingAssetAmount
            );
        }

        // Dynamically call the appropriate selector
        (bool success, bytes memory returnData) = _pool.call(callData);
        require(success, string(returnData));

        // Wrap native asset
        __curveLiquidityWrapNativeAssetBalance();
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to encode calldata for a call to add liquidity on Curve
    function __curveAddLiquidityEncodeCalldata(
        uint256[] memory _orderedOutgoingAssetAmounts,
        uint256 _minIncomingLpTokenAmount,
        bool _useUnderlyings
    ) private pure returns (bytes memory callData_) {
        bytes memory finalEncodedArgOrEmpty;
        if (_useUnderlyings) {
            finalEncodedArgOrEmpty = abi.encode(true);
        }

        return
            abi.encodePacked(
                __curveAddLiquidityEncodeSelector(
                    _orderedOutgoingAssetAmounts.length,
                    _useUnderlyings
                ),
                abi.encodePacked(_orderedOutgoingAssetAmounts),
                _minIncomingLpTokenAmount,
                finalEncodedArgOrEmpty
            );
    }

    /// @dev Helper to encode selector for a call to add liquidity on Curve
    function __curveAddLiquidityEncodeSelector(uint256 _numberOfCoins, bool _useUnderlyings)
        private
        pure
        returns (bytes4 selector_)
    {
        string memory finalArgOrEmpty;
        if (_useUnderlyings) {
            finalArgOrEmpty = ",bool";
        }

        return
            bytes4(
                keccak256(
                    abi.encodePacked(
                        "add_liquidity(uint256[",
                        _numberOfCoins.toString(),
                        "],",
                        "uint256",
                        finalArgOrEmpty,
                        ")"
                    )
                )
            );
    }

    /// @dev Helper to wrap the full native asset balance of the current contract
    function __curveLiquidityWrapNativeAssetBalance() private {
        uint256 nativeAssetBalance = payable(address(this)).balance;
        if (nativeAssetBalance > 0) {
            IWETH(payable(getCurveLiquidityWrappedNativeAsset())).deposit{
                value: nativeAssetBalance
            }();
        }
    }

    /// @dev Helper to encode calldata for a call to remove liquidity from Curve
    function __curveRemoveLiquidityEncodeCalldata(
        uint256 _outgoingLpTokenAmount,
        uint256[] memory _orderedMinIncomingAssetAmounts,
        bool _useUnderlyings
    ) private pure returns (bytes memory callData_) {
        bytes memory finalEncodedArgOrEmpty;
        if (_useUnderlyings) {
            finalEncodedArgOrEmpty = abi.encode(true);
        }

        return
            abi.encodePacked(
                __curveRemoveLiquidityEncodeSelector(
                    _orderedMinIncomingAssetAmounts.length,
                    _useUnderlyings
                ),
                _outgoingLpTokenAmount,
                abi.encodePacked(_orderedMinIncomingAssetAmounts),
                finalEncodedArgOrEmpty
            );
    }

    /// @dev Helper to encode selector for a call to remove liquidity on Curve
    function __curveRemoveLiquidityEncodeSelector(uint256 _numberOfCoins, bool _useUnderlyings)
        private
        pure
        returns (bytes4 selector_)
    {
        string memory finalArgOrEmpty;
        if (_useUnderlyings) {
            finalArgOrEmpty = ",bool";
        }

        return
            bytes4(
                keccak256(
                    abi.encodePacked(
                        "remove_liquidity(uint256,",
                        "uint256[",
                        _numberOfCoins.toString(),
                        "]",
                        finalArgOrEmpty,
                        ")"
                    )
                )
            );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CURVE_LIQUIDITY_WRAPPED_NATIVE_ASSET` variable
    /// @return addressProvider_ The `CURVE_LIQUIDITY_WRAPPED_NATIVE_ASSET` variable value
    function getCurveLiquidityWrappedNativeAsset() public view returns (address addressProvider_) {
        return CURVE_LIQUIDITY_WRAPPED_NATIVE_ASSET;
    }
}
