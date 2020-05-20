// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../integrations/interfaces/IKyberNetworkProxy.sol";
import "../registry/IRegistry.sol";
import "./IPriceSource.sol";


/// @title KyberPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Routes external prices to smart contracts from Kyber
contract KyberPriceFeed is IPriceSource, DSMath {
    event MaxPriceDeviationSet(uint256 maxPriceDeviation);
    event MaxSpreadSet(uint256 maxSpread);
    event PricesUpdated(address[] assets, uint256[] prices);
    event RegistrySet(address newRegistry);
    event UpdaterSet(address updater);

    uint8 public constant KYBER_PRECISION = 18;
    uint32 public constant VALIDITY_INTERVAL = 2 days;
    address public KYBER_NETWORK_PROXY;
    address public PRICEFEED_QUOTE_ASSET;

    uint256 public override lastUpdate;
    uint256 public maxPriceDeviation; // percent, expressed as a uint256 (fraction of 10^18)
    uint256 public maxSpread;
    address public updater;
    mapping (address => uint256) public prices; // TODO: Prices should be structs with a price, timestamp, and possibly validity
    IRegistry public registry;

    constructor(
        address _registry,
        address _kyberNetworkProxy,
        uint256 _maxSpread,
        address _quoteAsset,
        uint256 _maxPriceDeviation
    )
        public
    {
        registry = IRegistry(_registry);
        KYBER_NETWORK_PROXY = _kyberNetworkProxy;
        maxSpread = _maxSpread;
        PRICEFEED_QUOTE_ASSET = _quoteAsset;
        maxPriceDeviation = _maxPriceDeviation;
        updater = registry.owner();
    }

    modifier onlyRegistryOwner() {
        require(msg.sender == registry.owner(), "Only registry owner can do this");
        _;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Update prices for registered assets
    /// @dev Stores zero as a convention for invalid price
    /// @param _saneAssets Asset addresses (must match assets array from getRegisteredAssets)
    /// @param _sanePrices Asset price hints (checked against prices from Kyber)
    function update(
        address[] calldata _saneAssets,
        uint256[] calldata _sanePrices
    ) external {
        require(
            msg.sender == registry.owner() || msg.sender == updater,
            "update: Only registry owner or updater can call"
        );
        address[] memory registeredAssets = registry.getRegisteredAssets();
        require(
            keccak256(abi.encodePacked(_saneAssets)) ==
            keccak256(abi.encodePacked(registeredAssets)),
            "update: Passed and registered assets are not identical"
        );
        uint256[] memory newPrices = new uint256[](_saneAssets.length);
        for (uint256 i; i < _saneAssets.length; i++) {
            bool isValid;
            uint256 kyberPrice;
            if (_saneAssets[i] == registry.nativeAsset()) {
                isValid = true;
                kyberPrice = 1 ether;
            } else {
                (kyberPrice, isValid) = getLiveRate(_saneAssets[i], PRICEFEED_QUOTE_ASSET);
            }
            require(
                __priceIsSane(kyberPrice, _sanePrices[i]),
                "update: Kyber price deviates too much from maxPriceDeviation"
            );
            newPrices[i] = isValid ? kyberPrice : 0;
            prices[_saneAssets[i]] = newPrices[i];
        }
        lastUpdate = block.timestamp;
        emit PricesUpdated(_saneAssets, newPrices);
    }

    /// @notice Update maximum price deviation between price hints and Kyber price
    /// @notice Price deviation becomes a % when divided by 10^18 (e.g. 10^17 becomes 10%)
    /// @param _newMaxPriceDeviation New maximum price deviation
    function setMaxPriceDeviation(uint256 _newMaxPriceDeviation) external onlyRegistryOwner {
        maxPriceDeviation = _newMaxPriceDeviation;
        emit MaxPriceDeviationSet(_newMaxPriceDeviation);
    }

    /// @notice Update maximum spread for prices derived from Kyber
    /// @notice Max spread becomes a % when divided by 10^18 (e.g. 10^17 becomes 10%)
    /// @param _newMaxSpread New maximum spread
    function setMaxSpread(uint256 _newMaxSpread) external onlyRegistryOwner {
        maxSpread = _newMaxSpread;
        emit MaxSpreadSet(_newMaxSpread);
    }

    /// @notice Update this feed's Registry reference
    /// @param _newRegistry New Registry this feed should point to
    function setRegistry(address _newRegistry) external onlyRegistryOwner {
        registry = IRegistry(_newRegistry);
        emit RegistrySet(_newRegistry);
    }

    /// @notice Update this feed's designated updater
    /// @param _newUpdater New designated updater for this feed
    function setUpdater(address _newUpdater) external onlyRegistryOwner {
        updater = _newUpdater;
        emit UpdaterSet(_newUpdater);
    }

    // EXTERNAL VIEW FUNCTIONS

    /// @notice Returns rate and validity for some pair of assets using pricefeed prices
    /// @param _baseAsset Address of base asset from the pair
    /// @param _quoteAsset Address of quote asset from the pair
    /// @return rate_ The price of _baseAsset in terms of _quoteAsset
    /// @return isValid_ True if the rate for this pair is passes validation checks
    /// @return timestamp_ The time of the asset's most recent price update
    function getCanonicalRate(address _baseAsset, address _quoteAsset)
        external
        view
        override
        returns (uint256 rate_, bool isValid_, uint256 timestamp_)
    {
        require(_baseAsset != address(0), "getCanonicalRate: _baseAsset cannot be empty");
        require(_quoteAsset != address(0), "getCanonicalRate: _quoteAsset cannot be empty");

        // TODO: What if an asset is removed from registry? Need timestamp at asset level.
        timestamp_ = lastUpdate;

        // Return early if assets are same
        if (_baseAsset == _quoteAsset) {
            return (
                10 ** uint256(ERC20WithFields(_quoteAsset).decimals()),
                hasValidPrice(_quoteAsset),
                timestamp_
            );
        }

        uint256 baseAssetPrice = prices[_baseAsset];
        uint256 quoteAssetPrice = prices[_quoteAsset];

        // If no price for base or quote asset, return early
        if (baseAssetPrice == 0 || quoteAssetPrice == 0) {
            return (0, false, timestamp_); 
        }

        isValid_ = hasValidPrice(_baseAsset) && hasValidPrice(_quoteAsset);

        // If diff quote asset from pricefeed's quote asset, convert value
        if (_quoteAsset != PRICEFEED_QUOTE_ASSET) {
            rate_ = mul(
                baseAssetPrice,
                10 ** uint256(ERC20WithFields(_quoteAsset).decimals())
            ) / quoteAssetPrice;
        }
        else {
            rate_ = baseAssetPrice;
        }
    }

    // PUBLIC FUNCTIONS

    /// @notice Returns rate and validity for some pair of assets using Kyber as an oracle
    /// @param _baseAsset Address of base asset from the pair
    /// @param _quoteAsset Address of quote asset from the pair
    /// @return rate_ The price of _baseAsset in terms of _quoteAsset
    /// @return isValid_ True if the rate for this pair is passes validation checks
    function getLiveRate(address _baseAsset, address _quoteAsset)
        public
        view
        override
        returns (uint256 rate_, bool isValid_)
    {
        uint256 bidRate;
        uint256 bidRateOfReversePair;
        (bidRate,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            __getKyberMaskAsset(_baseAsset),
            __getKyberMaskAsset(_quoteAsset),
            1
        );
        (bidRateOfReversePair,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            __getKyberMaskAsset(_quoteAsset),
            __getKyberMaskAsset(_baseAsset),
            1
        );

        // Return early and avoid revert
        if (bidRate == 0 || bidRateOfReversePair == 0) {
            return (0, false);
        }

        uint256 askRate = 10 ** (uint256(KYBER_PRECISION) * 2) / bidRateOfReversePair;
        /**
          Average the bid/ask prices:
          avgPriceFromKyber = (bidRate + askRate) / 2
          kyberPrice = (avgPriceFromKyber * 10^quoteDecimals) / 10^kyberPrecision
          or, rearranged:
          kyberPrice = ((bidRate + askRate) * 10^quoteDecimals) / 2 * 10^kyberPrecision
        */
        rate_ = mul(
            add(bidRate, askRate),
            10 ** uint256(ERC20WithFields(_quoteAsset).decimals()) // use original quote decimals (not defined on mask)
        ) / mul(2, 10 ** uint256(KYBER_PRECISION));

        // Rate is valid if deviation between buy and ask rates is less than threshold
        // Ignores crossed condition where bidRate > askRate
        uint256 spreadFromKyber;
        if (bidRate < askRate) {
            spreadFromKyber = mul(
                sub(askRate, bidRate),
                10 ** uint256(KYBER_PRECISION)
            ) / askRate;
        }
        isValid_ = spreadFromKyber <= maxSpread && bidRate != 0 && askRate != 0;
    }

    /// @notice Whether an asset is registered and has a fresh price
    /// @param _asset Asset to check for a valid price
    /// @return isValid_ whether price of _asset is valid
    function hasValidPrice(address _asset)
        public
        view
        override
        returns (bool isValid_)
    {
        bool isRegistered = registry.assetIsRegistered(_asset);
        bool isFresh = block.timestamp < add(lastUpdate, VALIDITY_INTERVAL);
        isValid_ = prices[_asset] != 0 && isRegistered && isFresh;
    }

    // INTERNAL FUNCTIONS

    /// @dev Return Kyber ETH asset symbol if _asset is WETH
    function __getKyberMaskAsset(address _asset) internal view returns (address) {
        if (_asset == registry.nativeAsset()) {
            return address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
        }
        return _asset;
    }

    /// @dev Whether _priceFromKyber deviates no more than some % from _sanePrice
    function __priceIsSane(
        uint256 _priceFromKyber,
        uint256 _sanePrice
    )
        internal
        view
        returns (bool)
    {
        uint256 deviation;
        if (_priceFromKyber >= _sanePrice) {
            deviation = sub(_priceFromKyber, _sanePrice);
        } else {
            deviation = sub(_sanePrice, _priceFromKyber);
        }
        return mul(deviation, 10 ** uint256(KYBER_PRECISION)) / _sanePrice <= maxPriceDeviation;
    }
}
