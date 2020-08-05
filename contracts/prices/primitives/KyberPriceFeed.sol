// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../integrations/interfaces/IKyberNetworkProxy.sol";
import "../../registry/IRegistry.sol";
import "./IPriceSource.sol";

/// @title KyberPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Routes external prices to smart contracts from Kyber
contract KyberPriceFeed is IPriceSource {
    using SafeMath for uint256;

    event ExpectedRateWethQtySet(uint256 expectedRateWethQty);

    event MaxPriceDeviationSet(uint256 maxPriceDeviation);

    event MaxSpreadSet(uint256 maxSpread);

    event PricesUpdated(address[] assets, uint256[] sanePrices, uint256[] newPrices);

    event RegistrySet(address newRegistry);

    event UpdaterSet(address updater);

    uint256 public constant KYBER_PRECISION = 18;
    uint256 public constant override VALIDITY_INTERVAL = 2 days;
    address immutable public KYBER_NETWORK_PROXY;
    address immutable public PRICE_FEED_QUOTE_ASSET;

    uint256 public expectedRateWethQty;
    uint256 public override lastUpdate;
    uint256 public maxPriceDeviation; // percent (fraction of 10^18)
    uint256 public maxSpread;
    address public updater;
    mapping (address => uint256) public prices;
    IRegistry public registry;

    constructor(
        address _registry,
        address _kyberNetworkProxy,
        address _priceFeedQuoteAsset,
        address _updater,
        uint256 _expectedRateWethQty,
        uint256 _maxSpread,
        uint256 _maxPriceDeviation
    )
        public
    {
        expectedRateWethQty = _expectedRateWethQty;
        KYBER_NETWORK_PROXY = _kyberNetworkProxy;
        maxSpread = _maxSpread;
        PRICE_FEED_QUOTE_ASSET = _priceFeedQuoteAsset;
        maxPriceDeviation = _maxPriceDeviation;
        registry = IRegistry(_registry);
        updater = _updater;

        prices[_priceFeedQuoteAsset] = 10 ** KYBER_PRECISION;
    }

    modifier onlyRegistryOwner() {
        require(msg.sender == registry.owner(), "Only registry owner can do this");
        _;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Returns rate and validity for some pair of assets using price feed prices
    /// @param _baseAsset Address of base asset from the pair
    /// @param _quoteAsset Address of quote asset from the pair
    /// @return rate_ The price of _baseAsset in terms of _quoteAsset
    /// @return isValid_ True if the rate for this pair passes validation checks
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
                10 ** uint256(ERC20(_quoteAsset).decimals()),
                true,
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

        // If diff quote asset from price feed's quote asset, convert value
        if (_quoteAsset != PRICE_FEED_QUOTE_ASSET) {
            rate_ = baseAssetPrice.mul(10 ** uint256(ERC20(_quoteAsset).decimals())).div(quoteAssetPrice);
        }
        else {
            rate_ = baseAssetPrice;
        }
    }

    /// @notice Update the srcQty to use in getExpectedRate(), in terms of WETH
    /// @param _expectedRateWethQty New srcQty, in terms of WETH
    function setExpectedRateWethQty(uint256 _expectedRateWethQty) external onlyRegistryOwner {
        expectedRateWethQty = _expectedRateWethQty;
        emit ExpectedRateWethQtySet(_expectedRateWethQty);
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

    /// @notice Update prices for registered assets
    /// @dev Stores zero as a convention for invalid price
    /// @param _saneAssets Asset addresses (must match assets array from getRegisteredPrimitives)
    /// @param _sanePrices Asset price hints (checked against prices from Kyber)
    function update(address[] calldata _saneAssets, uint256[] calldata _sanePrices) external {
        require(
            msg.sender == registry.owner() || msg.sender == updater,
            "update: Only registry owner or updater can call"
        );

        address[] memory registeredAssets = registry.getRegisteredPrimitives();
        require(
            keccak256(abi.encodePacked(_saneAssets)) ==
            keccak256(abi.encodePacked(registeredAssets)),
            "update: Passed and registered assets are not identical"
        );

        uint256[] memory newPrices = new uint256[](_saneAssets.length);
        for (uint256 i; i < _saneAssets.length; i++) {
            if (_saneAssets[i] == PRICE_FEED_QUOTE_ASSET) {
                newPrices[i] = 10 ** KYBER_PRECISION;
                continue;
            }

            (uint256 kyberPrice,) = getLiveRate(_saneAssets[i], PRICE_FEED_QUOTE_ASSET);

            // Allow for prices that are expected to be 0
            if (kyberPrice == 0 && _sanePrices[i] == 0) {
                prices[_saneAssets[i]] = 0;
                continue;
            }
            require(
                __priceIsSane(kyberPrice, _sanePrices[i]),
                "update: Kyber price deviates too much from maxPriceDeviation"
            );

            newPrices[i] = kyberPrice;
            prices[_saneAssets[i]] = newPrices[i];
        }

        lastUpdate = block.timestamp;

        emit PricesUpdated(_saneAssets, _sanePrices, newPrices);
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
        // Return early if assets are same
        if (_baseAsset == _quoteAsset) {
            return (
                10 ** uint256(ERC20(_quoteAsset).decimals()),
                true
            );
        }

        uint256 bidRate;
        uint256 bidRateOfReversePair;
        (bidRate,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            __getKyberMaskAsset(_baseAsset),
            __getKyberMaskAsset(_quoteAsset),
            __calcSrcQtyForExpectedRateLookup(_baseAsset)
        );
        (bidRateOfReversePair,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            __getKyberMaskAsset(_quoteAsset),
            __getKyberMaskAsset(_baseAsset),
            __calcSrcQtyForExpectedRateLookup(_quoteAsset)
        );

        // Return early and avoid revert
        if (bidRate == 0 || bidRateOfReversePair == 0) {
            return (0, false);
        }

        uint256 askRate = ((10 ** KYBER_PRECISION).mul(2)).div(bidRateOfReversePair);
        /**
          Average the bid/ask prices:
          avgPriceFromKyber = (bidRate + askRate) / 2
          kyberPrice = (avgPriceFromKyber * 10^quoteDecimals) / 10^kyberPrecision
          or, rearranged:
          kyberPrice = ((bidRate + askRate) * 10^quoteDecimals) / 2 * 10^kyberPrecision
        */
        rate_ = bidRate.add(askRate)
            .mul(10 ** uint256(ERC20(_quoteAsset).decimals())) // use original quote decimals (not defined on mask)
            .div((10 ** KYBER_PRECISION).mul(2));

        // Rate is valid if deviation between buy and ask rates is less than threshold
        // Ignores crossed condition where bidRate > askRate
        uint256 spreadFromKyber;
        if (bidRate < askRate) {
            spreadFromKyber = askRate.sub(bidRate).mul(10 ** KYBER_PRECISION).div(askRate);
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
        bool isRegistered = registry.primitiveIsRegistered(_asset);
        bool isFresh = block.timestamp < lastUpdate.add(VALIDITY_INTERVAL);
        isValid_ = prices[_asset] != 0 && isRegistered && isFresh;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the srcQty with which to call getExpectedRate()
    function __calcSrcQtyForExpectedRateLookup(address _srcAsset) private view returns (uint256) {
        uint256 lastSrcAssetPrice = prices[_srcAsset];
        // If there has not been a price update yet, use 1 unit of the srcAsset
        if (lastSrcAssetPrice == 0) {
            return 10 ** uint256(ERC20(_srcAsset).decimals());
        }
        return expectedRateWethQty.mul(10 ** uint256(ERC20(_srcAsset).decimals())).div(lastSrcAssetPrice);
    }

    /// @dev Return Kyber ETH asset symbol if _asset is WETH
    function __getKyberMaskAsset(address _asset) private view returns (address) {
        if (_asset == registry.WETH_TOKEN()) {
            return address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
        }
        return _asset;
    }

    /// @dev Whether _priceFromKyber deviates no more than some % from _sanePrice
    function __priceIsSane(
        uint256 _priceFromKyber,
        uint256 _sanePrice
    )
        private
        view
        returns (bool)
    {
        uint256 deviation;
        if (_priceFromKyber >= _sanePrice) {
            deviation = _priceFromKyber.sub(_sanePrice);
        } else {
            deviation = _sanePrice.sub(_priceFromKyber);
        }
        return deviation.mul(10 ** KYBER_PRECISION).div(_sanePrice) <= maxPriceDeviation;
    }
}
