// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../interfaces/IERC20Extended.sol";
import "../price-feeds/derivatives/IDerivativePriceFeed.sol";
import "../price-feeds/primitives/IPrimitivePriceFeed.sol";
import "./IValueInterpreter.sol";

/// @title ValueInterpreter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interprets price sources to yield values across asset pairs
/// @dev All primitive price feeds are expected to provide normalized rates
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

    /// @notice Calculates the total value of amounts of arbitrary assets,
    /// using a canonical conversion rate
    /// @param _baseAssets The assets to convert
    /// @param _amounts The amounts of the _baseAssets to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @return isValid_ True if the price source rates are all valid
    function calcCanonicalAssetsTotalValue(
        address[] calldata _baseAssets,
        uint256[] calldata _amounts,
        address _quoteAsset
    ) external override returns (uint256 value_, bool isValid_) {
        require(
            _baseAssets.length == _amounts.length,
            "calcCanonicalAssetsTotalValue: arrays unequal lengths"
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

    /// @notice Calculates the total value of amounts of arbitrary assets,
    /// using live conversion rates
    /// @param _baseAssets The assets to convert
    /// @param _amounts The amounts of the _baseAssets to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @return isValid_ True if the price source rates are all valid
    function calcLiveAssetsTotalValue(
        address[] calldata _baseAssets,
        uint256[] calldata _amounts,
        address _quoteAsset
    ) external override returns (uint256 value_, bool isValid_) {
        require(
            _baseAssets.length == _amounts.length,
            "calcLiveAssetsTotalValue: arrays unequal lengths"
        );

        isValid_ = true;
        for (uint256 i; i < _baseAssets.length; i++) {
            (uint256 assetValue, bool assetValueIsValid) = calcLiveAssetValue(
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

    /// @notice Calculates the value of an amount in an arbitrary asset pair,
    /// using canonical conversion rates
    /// @param _baseAsset The asset from which to convert
    /// @param _amount The amount of the _baseAsset to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @return isValid_ True if the price source rates are all valid
    function calcCanonicalAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) public override returns (uint256 value_, bool isValid_) {
        return __calcAssetValue(_baseAsset, _amount, _quoteAsset, false);
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculates the value of an amount in an arbitrary asset pair,
    /// using a live conversion rate
    /// @param _baseAsset The asset from which to convert
    /// @param _amount The amount of the _baseAsset to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @return isValid_ True if the price source rates are all valid
    function calcLiveAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) public override returns (uint256 value_, bool isValid_) {
        return __calcAssetValue(_baseAsset, _amount, _quoteAsset, true);
    }

    /// @notice Checks whether an asset can be added to the fund
    /// @param _asset The asset contract address
    /// @return isReceivable_ True if the asset can be added
    /// @dev An asset is receivable if a valid price
    function isSupportedAsset(address _asset) external view override returns (bool isReceivable_) {
        return
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_asset) ||
            IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_asset);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the value of an amount in an arbitrary asset pair,
    /// either using live or canonical conversion rates
    function __calcAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset,
        bool _useLiveRate
    ) private returns (uint256 value_, bool isValid_) {
        IPrimitivePriceFeed primitivePriceFeedContract = IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED);
        // TODO: should any of this revert? Or should we avoid reverts in this contract?
        if (
            _baseAsset == address(0) ||
            _quoteAsset == address(0) ||
            _amount == 0 ||
            // Only queries with quote assets that are primitives are supported
            !primitivePriceFeedContract.isSupportedAsset(_quoteAsset)
        ) {
            return (0, false);
        }

        // Check if registered _asset first
        if (primitivePriceFeedContract.isSupportedAsset(_baseAsset)) {
            return __calcPrimitiveValue(_baseAsset, _amount, _quoteAsset, _useLiveRate);
        }

        // Else use derivative oracle to get value via underlying assets
        if (IDerivativePriceFeed(DERIVATIVE_PRICE_FEED).isSupportedAsset(_baseAsset)) {
            return __calcDerivativeValue(_baseAsset, _amount, _quoteAsset, _useLiveRate);
        }

        // If not in Registry as an asset or derivative
        return (0, false);
    }

    /// @dev Helper to covert from one asset to another with a normalized conversion rate
    function __calcDenormalizedConversionAmount(
        address _baseAsset,
        uint256 _baseAssetAmount,
        address _quoteAsset,
        uint256 _normalizedRate
    ) internal view returns (uint256) {
        return
            _normalizedRate
                .mul(_baseAssetAmount)
                .mul(10**uint256(IERC20Extended(_quoteAsset).decimals()))
                .div(10**(RATE_PRECISION.add(uint256(IERC20Extended(_baseAsset).decimals()))));
    }

    /// @dev Helper to calculate the value of a derivative in an arbitrary asset.
    /// Handles multiple underlying assets (e.g., Uniswap and Balancer pool tokens).
    /// Handles underlying assets that are also derivatives (e.g., a cDAI-ETH LP)
    function __calcDerivativeValue(
        address _derivative,
        uint256 _amount,
        address _quoteAsset,
        bool _useLiveRate
    ) private returns (uint256 value_, bool isValid_) {
        (address[] memory underlyings, uint256[] memory rates) = IDerivativePriceFeed(
            DERIVATIVE_PRICE_FEED
        )
            .getRatesToUnderlyings(_derivative);

        // Let validity be negated if any of the underlying value calculations are invalid.
        isValid_ = true;
        for (uint256 i = 0; i < underlyings.length; i++) {
            uint256 underlyingAmount = __calcDenormalizedConversionAmount(
                _derivative,
                _amount,
                underlyings[i],
                rates[i]
            );
            (uint256 underlyingValue, bool underlyingIsValid) = __calcAssetValue(
                underlyings[i],
                underlyingAmount,
                _quoteAsset,
                _useLiveRate
            );

            if (!underlyingIsValid) isValid_ = false;
            value_ = value_.add(underlyingValue);
        }
    }

    /// @dev Helper to calculate the value of a primitive (an asset that has a price
    /// in the primary price feed) in an arbitrary asset.
    function __calcPrimitiveValue(
        address _primitive,
        uint256 _amount,
        address _quoteAsset,
        bool _useLiveRate
    ) private view returns (uint256 value_, bool isValid_) {
        IPrimitivePriceFeed priceFeedContract = IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED);

        uint256 rate;
        if (_useLiveRate) {
            (rate, isValid_) = priceFeedContract.getLiveRate(_primitive, _quoteAsset);
        } else {
            (rate, isValid_, ) = priceFeedContract.getCanonicalRate(_primitive, _quoteAsset);
        }

        value_ = __calcDenormalizedConversionAmount(_primitive, _amount, _quoteAsset, rate);
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
