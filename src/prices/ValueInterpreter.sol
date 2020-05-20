pragma solidity 0.6.8;

import "./IDerivativePriceSource.sol";
import "./IPriceSource.sol";
import "./IValueInterpreter.sol";
import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../registry/IRegistry.sol";

/// @title ValueInterpreter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interprets price sources to yield values across asset pairs
contract ValueInterpreter is IValueInterpreter, DSMath {
    address REGISTRY;

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
    )
        external
        view
        override
        returns (uint256 value_, bool isValid_)
    {
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
    )
        external
        view
        override
        returns (uint256 value_, bool isValid_)
    {
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
    )
        private
        view
        returns (uint256 value_, bool isValid_)
    {
        IRegistry registry = IRegistry(REGISTRY);

        // Check if registered _asset first
        // TODO: Consider checking against IPriceSource instead of Registry
        if (registry.assetIsRegistered(_baseAsset)) {
            uint256 rate;
            (rate, isValid_) = __getAssetRate(_baseAsset, _quoteAsset, _useLiveRate);

            if (rate == 0) return (0, false);

            value_ = __calcConversionAmount(_baseAsset, _amount, rate);
        }

        // Else use derivative oracle to get value via underlying assets
        else if (registry.derivativeToPriceSource(_baseAsset) != address(0)) {
            (
                address underlying,
                uint256 rate
            ) = __getDerivativeRateToUnderlying(_baseAsset, _useLiveRate);

            // TODO: What does isValid mean in this context?
            if (rate == 0) return (0, false);

            uint256 underlyingAmount = __calcConversionAmount(underlying, _amount, rate);
            uint256 underlyingRate;
            (underlyingRate, isValid_) = __getAssetRate(underlying, _quoteAsset, _useLiveRate);

            value_ = __calcConversionAmount(underlying, underlyingAmount, rate);
        }

        // If not in Registry as an asset or derivative
        else return (0, false);
    }

    /// @notice Helper to calculate the rate of an asset in the Registry
    function __getAssetRate(address _baseAsset, address _quoteAsset, bool _useLiveRate)
        private
        view
        returns (uint256 rate_, bool isValid_)
    {
        // If/when we allow choice in price source, we can get this per fund
        IPriceSource priceSource = IPriceSource(IRegistry(REGISTRY).priceSource());

        if (_useLiveRate) {
            (rate_, isValid_) = priceSource.getLiveRate(_baseAsset, _quoteAsset);
        }
        else {
            (rate_, isValid_, ) = priceSource.getCanonicalRate(_baseAsset, _quoteAsset);
        }
    }

    /// @notice Helper to calculate the rate of a derivative in the Registry
    // TODO: 2 key updates need to be made for this to work with many more derivatives:
    // 1. Underlying assets that are also derivatives (how to handle recursion)
    // 2. Assets that have multiple Underlying assets (e.g., Uniswap and Balancer pool tokens)
    function __getDerivativeRateToUnderlying(address _derivative, bool _useLiveRate)
        private
        view
        returns (address underlying_, uint256 rate_)
    {
        IDerivativePriceSource derivativePriceSource = IDerivativePriceSource(
            IRegistry(REGISTRY).derivativeToPriceSource(_derivative)
        );

        if (_useLiveRate) {
            (underlying_, rate_) = derivativePriceSource.getLiveRateToUnderlying(_derivative);
        }
        else {
            (underlying_, rate_) = derivativePriceSource.getCanonicalRateToUnderlying(_derivative);
        }
    }

    /// @notice Helper to covert from one asset to another with a given conversion rate
    function __calcConversionAmount(address _asset, uint256 _amount, uint256 _rate)
        private
        view
        returns (uint256)
    {
        return mul(_rate, _amount) / 10 ** uint256(ERC20WithFields(_asset).decimals());
    }
}
