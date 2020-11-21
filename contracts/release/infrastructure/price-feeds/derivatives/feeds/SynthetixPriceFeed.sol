// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../interfaces/ISynthetix.sol";
import "../../../../interfaces/ISynthetixAddressResolver.sol";
import "../../../../interfaces/ISynthetixExchangeRates.sol";
import "../../../../interfaces/ISynthetixProxyERC20.sol";
import "../../../../interfaces/ISynthetixSynth.sol";
import "../../../utils/DispatcherOwnerMixin.sol";
import "../IDerivativePriceFeed.sol";

/// @title SynthetixPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A price feed that uses Synthetix oracles as price sources
contract SynthetixPriceFeed is IDerivativePriceFeed, DispatcherOwnerMixin {
    event SynthAdded(address indexed synth, bytes32 currencyKey);

    event SynthCurrencyKeyUpdated(
        address indexed synth,
        bytes32 prevCurrencyKey,
        bytes32 nextCurrencyKey
    );

    address private immutable ADDRESS_RESOLVER;
    address private immutable SUSD;

    mapping(address => bytes32) private synthToCurrencyKey;

    constructor(
        address _dispatcher,
        address _addressResolver,
        address _sUSD,
        address[] memory _synths
    ) public DispatcherOwnerMixin(_dispatcher) {
        ADDRESS_RESOLVER = _addressResolver;
        SUSD = _sUSD;

        address[] memory sUSDSynths = new address[](1);
        sUSDSynths[0] = _sUSD;

        __addSynths(sUSDSynths);
        __addSynths(_synths);
    }

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

        bytes32 currencyKey = getCurrencyKeyForSynth(_derivative);
        require(currencyKey != 0, "getRatesToUnderlyings: _derivative is not supported");

        address exchangeRates = ISynthetixAddressResolver(ADDRESS_RESOLVER).requireAndGetAddress(
            "ExchangeRates",
            "getRatesToUnderlyings: Missing ExchangeRates"
        );

        (uint256 rate, bool isInvalid) = ISynthetixExchangeRates(exchangeRates).rateAndInvalid(
            currencyKey
        );
        require(!isInvalid, "getRatesToUnderlyings: _derivative rate is not valid");

        rates_[0] = rate;

        return (underlyings_, rates_);
    }

    /// @notice Checks whether an asset is a supported primitive of the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is a supported primitive
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return getCurrencyKeyForSynth(_asset) != 0;
    }

    /////////////////////
    // SYNTHS REGISTRY //
    /////////////////////

    /// @notice Adds Synths to the price feed
    /// @param _synths Synths to add
    function addSynths(address[] calldata _synths) external onlyDispatcherOwner {
        require(_synths.length > 0, "addSynths: Empty _synths");

        __addSynths(_synths);
    }

    /// @notice Updates the cached currencyKey value for specified Synths
    /// @param _synths Synths to update
    /// @dev Anybody can call this function
    function updateSynthCurrencyKeys(address[] calldata _synths) external {
        require(_synths.length > 0, "updateSynthCurrencyKeys: Empty _synths");

        for (uint256 i; i < _synths.length; i++) {
            bytes32 prevCurrencyKey = synthToCurrencyKey[_synths[i]];
            require(prevCurrencyKey != 0, "updateSynthCurrencyKeys: Synth not set");

            bytes32 nextCurrencyKey = __getCurrencyKey(_synths[i]);
            require(
                nextCurrencyKey != prevCurrencyKey,
                "updateSynthCurrencyKeys: Synth has correct currencyKey"
            );

            synthToCurrencyKey[_synths[i]] = nextCurrencyKey;

            emit SynthCurrencyKeyUpdated(_synths[i], prevCurrencyKey, nextCurrencyKey);
        }
    }

    /// @dev Helper to add Synths
    function __addSynths(address[] memory _synths) private {
        for (uint256 i; i < _synths.length; i++) {
            require(synthToCurrencyKey[_synths[i]] == 0, "__addSynths: Value already set");

            bytes32 currencyKey = __getCurrencyKey(_synths[i]);
            require(currencyKey != 0, "__addSynths: No currencyKey");

            synthToCurrencyKey[_synths[i]] = currencyKey;

            emit SynthAdded(_synths[i], currencyKey);
        }
    }

    /// @dev Helper to query a currencyKey from Synthetix
    function __getCurrencyKey(address _synthProxy) private view returns (bytes32 currencyKey_) {
        return ISynthetixSynth(ISynthetixProxyERC20(_synthProxy).target()).currencyKey();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ADDRESS_RESOLVER` variable
    /// @return addressResolver_ The `ADDRESS_RESOLVER` variable value
    function getAddressResolver() external view returns (address) {
        return ADDRESS_RESOLVER;
    }

    /// @notice Gets the currencyKey for multiple given Synths
    /// @return currencyKeys_ The currencyKey values
    function getCurrencyKeysForSynths(address[] calldata _synths)
        external
        view
        returns (bytes32[] memory currencyKeys_)
    {
        currencyKeys_ = new bytes32[](_synths.length);
        for (uint256 i; i < _synths.length; i++) {
            currencyKeys_[i] = synthToCurrencyKey[_synths[i]];
        }

        return currencyKeys_;
    }

    /// @notice Gets the `SUSD` variable
    /// @return susd_ The `SUSD` variable value
    function getSUSD() external view returns (address susd_) {
        return SUSD;
    }

    /// @notice Gets the currencyKey for a given Synth
    /// @return currencyKey_ The currencyKey value
    function getCurrencyKeyForSynth(address _synth) public view returns (bytes32 currencyKey_) {
        return synthToCurrencyKey[_synth];
    }
}
