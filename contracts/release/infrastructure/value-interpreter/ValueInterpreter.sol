// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../price-feeds/primitives/IPrimitivePriceFeed.sol";
import "./IValueInterpreter.sol";

/// @title ValueInterpreter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interprets price feeds to provide covert value between asset pairs
/// @dev All price feeds are expected to provide rates normalized to 18 decimals.
/// This contract contains several "live" rate calculations, which for this release are simply
/// aliases to their "canonical" rate counterparts since the only primitive price feed (Chainlink)
/// is immutable in this contract and only has one type of rate. Including the "live" versions of
/// functions only serves as a placeholder for infrastructural components and plugins (e.g., policies)
/// to explicitly define the types of rates that they should (and will) be using in a future release.
contract ValueInterpreter is IValueInterpreter {
    using SafeMath for uint256;

    uint256 private constant RATE_PRECISION = 18;

    address private immutable DERIVATIVE_PRICE_FEED;
    address private immutable PRIMITIVE_PRICE_FEED;

    constructor(address _primitivePriceFeed, address _derivativePriceFeed) public {
        DERIVATIVE_PRICE_FEED = _derivativePriceFeed;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
    }

    // EXTERNAL FUNCTIONS

    /// @notice An alias of calcCanonicalAssetsTotalValue
    function calcLiveAssetsTotalValue(
        address[] calldata _baseAssets,
        uint256[] calldata _amounts,
        address _quoteAsset
    ) external override returns (uint256 value_, bool isValid_) {
        return calcCanonicalAssetsTotalValue(_baseAssets, _amounts, _quoteAsset);
    }

    /// @notice An alias of calcCanonicalAssetValue
    function calcLiveAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) external override returns (uint256 value_, bool isValid_) {
        return calcCanonicalAssetValue(_baseAsset, _amount, _quoteAsset);
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculates the total value of given amounts of assets in a single quote asset
    /// @param _baseAssets The assets to convert
    /// @param _amounts The amounts of the _baseAssets to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The sum value of _baseAssets, denominated in the _quoteAsset
    /// @return isValid_ True if the price feed rates used to derive value are all valid
    /// @dev Does not alter protocol state,
    /// but not a view because calls to price feeds can potentially update third party state
    function calcCanonicalAssetsTotalValue(
        address[] memory _baseAssets,
        uint256[] memory _amounts,
        address _quoteAsset
    ) public override returns (uint256 value_, bool isValid_) {
        require(
            _baseAssets.length == _amounts.length,
            "calcCanonicalAssetsTotalValue: Arrays unequal lengths"
        );

        isValid_ = true;
        for (uint256 i; i < _baseAssets.length; i++) {
            (uint256 assetValue, bool assetValueIsValid) = calcCanonicalAssetValue(
                _baseAssets[i],
                _amounts[i],
                _quoteAsset
            );
            value_ = value_.add(assetValue);
            if (!assetValueIsValid) {
                isValid_ = false;
            }
        }

        return (value_, isValid_);
    }

    /// @notice Calculates the value of a given amount of one asset in terms of another
    /// @param _baseAsset The asset from which to convert
    /// @param _amount The amount of the _baseAsset to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @return isValid_ True if the price feed rates used to derive value are all valid
    /// @dev Does not alter protocol state,
    /// but not a view because calls to price feeds can potentially update third party state
    function calcCanonicalAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) public override returns (uint256 value_, bool isValid_) {
        // This is the only case where 0 is a valid return value
        if (_amount == 0) {
            return (0, true);
        }

        require(_baseAsset != address(0), "calcCanonicalAssetValue: Empty _baseAsset");
        require(_quoteAsset != address(0), "calcCanonicalAssetValue: Empty _quoteAsset");

        IPrimitivePriceFeed primitivePriceFeedContract = IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED);
        require(
            primitivePriceFeedContract.isSupportedAsset(_quoteAsset),
            "calcCanonicalAssetValue: Unsupported _quoteAsset"
        );

        // Handle a _baseAsset that is a primitive, derivative, or unsupported
        if (primitivePriceFeedContract.isSupportedAsset(_baseAsset)) {
            return __calcPrimitiveValue(_baseAsset, _amount, _quoteAsset);
        }
        if (IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_baseAsset)) {
            return __calcDerivativeValue(_baseAsset, _amount, _quoteAsset);
        }
        revert("calcCanonicalAssetValue: Unsupported _baseAsset");
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to covert from one asset to another via a normalized conversion rate
    function __calcDenormalizedConversionAmount(
        address _baseAsset,
        uint256 _baseAssetAmount,
        address _quoteAsset,
        uint256 _normalizedRate
    ) internal view returns (uint256) {
        return
            _normalizedRate
                .mul(_baseAssetAmount)
                .mul(10**uint256(ERC20(_quoteAsset).decimals()))
                .div(10**(RATE_PRECISION.add(uint256(ERC20(_baseAsset).decimals()))));
    }

    /// @dev Helper to calculate the value of a derivative in an arbitrary asset.
    /// Handles multiple underlying assets (e.g., Uniswap and Balancer pool tokens).
    /// Handles underlying assets that are also derivatives (e.g., a cDAI-ETH LP)
    function __calcDerivativeValue(
        address _derivative,
        uint256 _amount,
        address _quoteAsset
    ) private returns (uint256 value_, bool isValid_) {
        (address[] memory underlyings, uint256[] memory rates) = IDerivativePriceFeed(
            DERIVATIVE_PRICE_FEED
        )
            .getRatesToUnderlyings(_derivative);

        require(underlyings.length > 0, "__calcDerivativeValue: No underlyings");
        require(
            underlyings.length == rates.length,
            "__calcDerivativeValue: Arrays unequal lengths"
        );

        // Let validity be negated if any of the underlying value calculations are invalid
        isValid_ = true;
        for (uint256 i = 0; i < underlyings.length; i++) {
            uint256 underlyingAmount = __calcDenormalizedConversionAmount(
                _derivative,
                _amount,
                underlyings[i],
                rates[i]
            );
            (uint256 underlyingValue, bool underlyingIsValid) = calcCanonicalAssetValue(
                underlyings[i],
                underlyingAmount,
                _quoteAsset
            );

            if (!underlyingIsValid) {
                isValid_ = false;
            }
            value_ = value_.add(underlyingValue);
        }
    }

    /// @dev Helper to calculate the value of a primitive in an arbitrary asset
    function __calcPrimitiveValue(
        address _primitive,
        uint256 _amount,
        address _quoteAsset
    ) private view returns (uint256 value_, bool isValid_) {
        uint256 rate;
        (rate, isValid_) = IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).getCanonicalRate(
            _primitive,
            _quoteAsset
        );

        value_ = __calcDenormalizedConversionAmount(_primitive, _amount, _quoteAsset, rate);

        return (value_, isValid_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `DERIVATIVE_PRICE_FEED` variable
    /// @return derivativePriceFeed_ The `DERIVATIVE_PRICE_FEED` variable value
    function getDerivativePriceFeed() external view returns (address derivativePriceFeed_) {
        return DERIVATIVE_PRICE_FEED;
    }

    /// @notice Gets the `PRIMITIVE_PRICE_FEED` variable
    /// @return primitivePriceFeed_ The `PRIMITIVE_PRICE_FEED` variable value
    function getPrimitivePriceFeed() external view returns (address primitivePriceFeed_) {
        return PRIMITIVE_PRICE_FEED;
    }
}
