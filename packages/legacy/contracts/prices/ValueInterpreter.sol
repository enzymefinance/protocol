// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./derivatives/IDerivativePriceSource.sol";
import "./primitives/IPriceSource.sol";
import "./IValueInterpreter.sol";
import "../registry/IRegistry.sol";

/// @title ValueInterpreter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interprets price sources to yield values across asset pairs
contract ValueInterpreter is IValueInterpreter {
    using SafeMath for uint256;

    address public REGISTRY;

    constructor(address _registry) public {
        REGISTRY = _registry;
    }

    /// @notice Calculates the value of an amount in an arbitrary asset pair,
    /// using a canonical conversion rate
    /// @param _baseAsset The asset from which to convert
    /// @param _baseAsset The amount of the _baseAsset to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @return isValid_ True if the price source rates are all valid
    function calcCanonicalAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) external override returns (uint256 value_, bool isValid_) {
        return __calcAssetValue(_baseAsset, _amount, _quoteAsset, false);
    }

    /// @notice Calculates the value of an amount in an arbitrary asset pair,
    /// using a live conversion rate
    /// @param _baseAsset The asset from which to convert
    /// @param _baseAsset The amount of the _baseAsset to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @return isValid_ True if the price source rates are all valid
    function calcLiveAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) external override returns (uint256 value_, bool isValid_) {
        return __calcAssetValue(_baseAsset, _amount, _quoteAsset, true);
    }

    // PRIVATE FUNCTIONS

    /// @notice Calculates the value of an amount in an arbitrary asset pair,
    /// either using live or canonical conversion rates
    function __calcAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset,
        bool _useLiveRate
    ) private returns (uint256 value_, bool isValid_) {
        IRegistry registry = IRegistry(REGISTRY);

        // Check if registered _asset first
        // TODO: Consider checking against IPriceSource instead of Registry
        if (registry.primitiveIsRegistered(_baseAsset)) {
            return __calcPrimitiveValue(_baseAsset, _amount, _quoteAsset, _useLiveRate);
        }

        // Else use derivative oracle to get value via underlying assets
        if (registry.derivativeToPriceSource(_baseAsset) != address(0)) {
            return __calcDerivativeValue(_baseAsset, _amount, _quoteAsset, _useLiveRate);
        }

        // If not in Registry as an asset or derivative
        return (0, false);
    }

    /// @notice Helper to covert from one asset to another with a given conversion rate
    function __calcConversionAmount(
        address _asset,
        uint256 _amount,
        uint256 _rate
    ) private view returns (uint256) {
        return _rate.mul(_amount).div(10**uint256(ERC20(_asset).decimals()));
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
        address derivativePriceSource = IRegistry(REGISTRY).derivativeToPriceSource(_derivative);
        (address[] memory underlyings, uint256[] memory rates) = IDerivativePriceSource(
            derivativePriceSource
        )
            .getRatesToUnderlyings(_derivative);

        // Let validity be negated if any of the underlying value caculations are invalid.
        isValid_ = true;
        for (uint256 i = 0; i < underlyings.length; i++) {
            uint256 underlyingAmount = __calcConversionAmount(underlyings[i], _amount, rates[i]);
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
    /// in the primary pricefeed) in an arbitrary asset.
    function __calcPrimitiveValue(
        address _primitive,
        uint256 _amount,
        address _quoteAsset,
        bool _useLiveRate
    ) private view returns (uint256 value_, bool isValid_) {
        IPriceSource priceSource = IPriceSource(IRegistry(REGISTRY).priceSource());

        uint256 rate;
        if (_useLiveRate) {
            (rate, isValid_) = priceSource.getLiveRate(_primitive, _quoteAsset);
        } else {
            (rate, isValid_, ) = priceSource.getCanonicalRate(_primitive, _quoteAsset);
        }

        value_ = __calcConversionAmount(_primitive, _amount, rate);
    }
}
