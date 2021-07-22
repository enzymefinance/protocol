// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/ISynthetix.sol";
import "../../../../interfaces/ISynthetixAddressResolver.sol";
import "../../../../interfaces/ISynthetixExchangeRates.sol";
import "../../../../interfaces/ISynthetixProxyERC20.sol";
import "../../../../interfaces/ISynthetixSynth.sol";
import "../../../../utils/FundDeployerOwnerMixin.sol";
import "../IDerivativePriceFeed.sol";

/// @title SynthetixPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A price feed that uses Synthetix oracles as price sources
contract SynthetixPriceFeed is IDerivativePriceFeed, FundDeployerOwnerMixin {
    using SafeMath for uint256;

    event SynthAdded(address indexed synth, bytes32 currencyKey);

    event SynthRemoved(address indexed synth, bytes32 currencyKey);

    uint256 private constant SYNTH_UNIT = 10**18;
    address private immutable ADDRESS_RESOLVER;
    address private immutable SUSD;

    mapping(address => bytes32) private synthToCurrencyKey;

    constructor(
        address _fundDeployer,
        address _addressResolver,
        address _sUSD
    ) public FundDeployerOwnerMixin(_fundDeployer) {
        ADDRESS_RESOLVER = _addressResolver;
        SUSD = _sUSD;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        underlyings_ = new address[](1);
        underlyings_[0] = getSUSD();
        underlyingAmounts_ = new uint256[](1);

        bytes32 currencyKey = getCurrencyKeyForSynth(_derivative);
        require(currencyKey != 0, "calcUnderlyingValues: _derivative is not supported");

        address exchangeRates = ISynthetixAddressResolver(getAddressResolver())
            .requireAndGetAddress("ExchangeRates", "calcUnderlyingValues: Missing ExchangeRates");

        (uint256 rate, bool isInvalid) = ISynthetixExchangeRates(exchangeRates).rateAndInvalid(
            currencyKey
        );
        require(!isInvalid, "calcUnderlyingValues: _derivative rate is not valid");

        underlyingAmounts_[0] = _derivativeAmount.mul(rate).div(SYNTH_UNIT);

        return (underlyings_, underlyingAmounts_);
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
    function addSynths(address[] calldata _synths) external onlyFundDeployerOwner {
        for (uint256 i; i < _synths.length; i++) {
            require(getCurrencyKeyForSynth(_synths[i]) == 0, "addSynths: Value already set");

            bytes32 currencyKey = __getCanonicalCurrencyKey(_synths[i]);
            require(currencyKey != 0, "addSynths: No currencyKey");

            synthToCurrencyKey[_synths[i]] = currencyKey;

            emit SynthAdded(_synths[i], currencyKey);
        }
    }

    /// @notice Removes Synths from the price feed
    /// @param _synths Synths to remove
    /// @dev Removing Synths from this feed will also affect the AssetFinalityResolver,
    /// as this contract is its shortcut determining whether assets are Synths
    function removeSynths(address[] calldata _synths) external onlyFundDeployerOwner {
        for (uint256 i; i < _synths.length; i++) {
            bytes32 currencyKey = getCurrencyKeyForSynth(_synths[i]);
            require(currencyKey != 0, "removeSynths: Synth not set");

            delete synthToCurrencyKey[_synths[i]];

            emit SynthRemoved(_synths[i], currencyKey);
        }
    }

    /// @dev Helper to query a currencyKey from Synthetix
    function __getCanonicalCurrencyKey(address _synthProxy)
        private
        view
        returns (bytes32 currencyKey_)
    {
        return ISynthetixSynth(ISynthetixProxyERC20(_synthProxy).target()).currencyKey();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Gets the currencyKey for multiple given Synths
    /// @return currencyKeys_ The currencyKey values
    function getCurrencyKeysForSynths(address[] calldata _synths)
        external
        view
        returns (bytes32[] memory currencyKeys_)
    {
        currencyKeys_ = new bytes32[](_synths.length);
        for (uint256 i; i < _synths.length; i++) {
            currencyKeys_[i] = getCurrencyKeyForSynth(_synths[i]);
        }

        return currencyKeys_;
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the `ADDRESS_RESOLVER` variable
    /// @return addressResolver_ The `ADDRESS_RESOLVER` variable value
    function getAddressResolver() public view returns (address) {
        return ADDRESS_RESOLVER;
    }

    /// @notice Gets the currencyKey for a given Synth
    /// @return currencyKey_ The currencyKey value
    function getCurrencyKeyForSynth(address _synth) public view returns (bytes32 currencyKey_) {
        return synthToCurrencyKey[_synth];
    }

    /// @notice Gets the `SUSD` variable
    /// @return susd_ The `SUSD` variable value
    function getSUSD() public view returns (address susd_) {
        return SUSD;
    }
}
