// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../interfaces/ISynthetix.sol";
import "../../../../interfaces/ISynthetixAddressResolver.sol";
import "../../../../interfaces/ISynthetixExchangeRates.sol";
import "../../../../utils/SynthetixHelper.sol";
import "../IDerivativePriceFeed.sol";

/// @title SynthetixPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A price feed that uses Synthetix oracles as price sources
contract SynthetixPriceFeed is IDerivativePriceFeed, SynthetixHelper {
    address private immutable ADDRESS_RESOLVER;
    address private immutable SUSD;

    constructor(address _addressResolver, address _sUSD) public {
        ADDRESS_RESOLVER = _addressResolver;
        SUSD = _sUSD;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Gets the rates for 1 unit of the derivative to its underlying assets
    /// @param _derivative The derivative for which to get the rates
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return rates_ The rates for the _derivative to the _underlyings
    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        underlyings_ = new address[](1);
        underlyings_[0] = SUSD;
        rates_ = new uint256[](1);

        if (_derivative == SUSD) {
            rates_[0] = 10**18;
        } else {
            bytes32 derivativeCurrencyKey = getCurrencyKey(_derivative);
            require(
                derivativeCurrencyKey != 0,
                "getRatesToUnderlyings: _derivative is not present in Synthetix"
            );

            address exchangeRates = ISynthetixAddressResolver(ADDRESS_RESOLVER)
                .requireAndGetAddress(
                "ExchangeRates",
                "getRatesToUnderlyings: Missing ExchangeRates"
            );

            (uint256 rate, bool isInvalid) = ISynthetixExchangeRates(exchangeRates).rateAndInvalid(
                derivativeCurrencyKey
            );
            require(!isInvalid, "getRatesToUnderlyings: _derivative rate is not valid");

            rates_[0] = rate;
        }

        return (underlyings_, rates_);
    }

    /// @notice Checks whether an asset is a supported primitive of the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is a supported primitive
    function isSupportedAsset(address _asset) external view override returns (bool isSupported_) {
        return getCurrencyKey(_asset) != 0;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getAddressResolver() external view returns (address) {
        return ADDRESS_RESOLVER;
    }

    function getSUSD() external view returns (address) {
        return SUSD;
    }
}
