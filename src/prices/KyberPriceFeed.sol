pragma solidity 0.6.1;

import "../dependencies/token/IERC20.sol";
import "../dependencies/DSMath.sol";
import "../exchanges/interfaces/IKyberNetworkProxy.sol";
import "../version/Registry.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
contract KyberPriceFeed is DSMath {
    event PriceUpdate(address[] token, uint256[] price);

    uint8 public constant KYBER_PRECISION = 18;
    uint32 public constant VALIDITY_INTERVAL = 2 days;
    address public constant KYBER_ETH_TOKEN = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    address public KYBER_NETWORK_PROXY;
    address public QUOTE_ASSET;
    address public updater;
    Registry public registry;
    uint256 public maxSpread;
    uint256 public lastUpdate;
    uint256 public maxPriceDeviation; // percent, expressed as a uint256 (fraction of 10^18)

    // FIELDS

    mapping (address => uint256) public prices;

    // METHODS

    // CONSTRUCTOR

    constructor(
        address _registry,
        address _kyberNetworkProxy,
        uint256 _maxSpread,
        address _quoteAsset,
        uint256 _maxPriceDeviation
    )
        public
    {
        registry = Registry(_registry);
        KYBER_NETWORK_PROXY = _kyberNetworkProxy;
        maxSpread = _maxSpread;
        QUOTE_ASSET = _quoteAsset;
        maxPriceDeviation = _maxPriceDeviation;
        updater = registry.owner();
    }

    modifier onlyRegistryOwner() {
        require(msg.sender == registry.owner(), "Only registry owner can set");
        _;
    }

    /// @return Whether _priceFromKyber deviates no more than some % from _offChainPrice
    function __priceIsSane(
        uint256 _priceFromKyber,
        uint256 _offchainPrice
    )
        internal
        view
        returns (bool)
    {
        uint256 deviation;
        if (_priceFromKyber >= _offchainPrice) {
            deviation = sub(_priceFromKyber, _offchainPrice);
        } else {
            deviation = sub(_offchainPrice, _priceFromKyber);
        }
        return mul(deviation, 10 ** KYBER_PRECISION) / _offchainPrice <= maxPriceDeviation;
    }

    /// @dev Stores zero as a convention for invalid price
    /// @dev passed _saneAssets must match the assets array from getRegisteredAssets
    function update(address[] calldata _saneAssets, uint256[] calldata _sanePrices) external {
        require(
            _saneAssets.length == _sanePrices.length,
            "update: Passed array lengths unequal"
        );
        require(
            msg.sender == registry.owner() || msg.sender == updater,
            "update: Only registry owner or updater can call"
        );
        address[] memory registeredAssets = registry.getRegisteredAssets();
        uint256[] memory newPrices = new uint256[](registeredAssets.length);
        for (uint256 i; i < registeredAssets.length; i++) {
            bool isValid;
            uint256 kyberPrice;
            require(
                _saneAssets[i] == registeredAssets[i],
                "update: Passed asset does not match registered assets"
            );
            if (registeredAssets[i] == QUOTE_ASSET) {
                isValid = true;
                kyberPrice = 1 ether;
            } else {
                (isValid, kyberPrice) = getKyberPrice(registeredAssets[i], QUOTE_ASSET);
            }
            require(
                __priceIsSane(kyberPrice, _sanePrices[i]),
                "update: Kyber price deviates too much from maxPriceDeviation"
            );
            newPrices[i] = isValid ? kyberPrice : 0;
            prices[registeredAssets[i]] = newPrices[i];
        }
        lastUpdate = block.timestamp;
        emit PriceUpdate(registeredAssets, newPrices);
    }

    function setUpdater(address _updater) external onlyRegistryOwner {
        updater = _updater;
    }

    function setRegistry(address _newRegistry) external onlyRegistryOwner {
        registry = Registry(_newRegistry);
    }

    /// @notice _maxSpread becomes a percentage when divided by 10^18
    /// @notice (e.g. 10^17 becomes 10%)
    function setMaxSpread(uint256 _maxSpread) external onlyRegistryOwner {
        maxSpread = _maxSpread;
    }

    function setMaxPriceDeviation(uint256 _maxPriceDeviation) external onlyRegistryOwner {
        maxPriceDeviation = _maxPriceDeviation;
    }

    // PUBLIC VIEW METHODS

    // FEED INFORMATION

    function getQuoteAsset() public view returns (address) { return QUOTE_ASSET; }
    function getLastUpdate() public view returns (uint256) { return lastUpdate; }

    // PRICES

    /// @notice Gets price of an asset multiplied by ten to the power of assetDecimals
    /// @dev Asset has been registered
    /// @param _asset = Asset for which price should be returned
    /// @return price_ = Price formatting: mul(exchangePrice, 10 ** decimal) to avoid floating point
    /// @return timestamp_ = When the asset's price was updated
    function getPrice(address _asset)
        public
        view
        returns (uint256 price_, uint256 timestamp_)
    {
        (price_, ) =  getReferencePriceInfo(_asset, QUOTE_ASSET);
        timestamp_ = now;
    }

    /// @notice Return getPrice for each of _assets
    function getPrices(address[] memory _assets)
        public
        view
        returns (uint256[] memory, uint256[] memory)
    {
        uint256[] memory newPrices = new uint256[](_assets.length);
        uint256[] memory timestamps = new uint256[](_assets.length);
        for (uint256 i; i < _assets.length; i++) {
            (newPrices[i], timestamps[i]) = getPrice(_assets[i]);
        }
        return (newPrices, timestamps);
    }

    /// @notice Whether an asset is registered and has a fresh price
    function hasValidPrice(address _asset)
        public
        view
        returns (bool)
    {
        bool isRegistered = registry.assetIsRegistered(_asset);
        bool isFresh = block.timestamp < add(lastUpdate, VALIDITY_INTERVAL);
        return prices[_asset] != 0 && isRegistered && isFresh;
    }

    /// @notice Whether each of the _assets is registered and has a fresh price
    function hasValidPrices(address[] memory _assets)
        public
        view
        returns (bool)
    {
        for (uint256 i; i < _assets.length; i++) {
            if (!hasValidPrice(_assets[i])) {
                return false;
            }
        }
        return true;
    }

    /// @param _baseAsset = Address of base asset
    /// @param _quoteAsset = Address of quote asset
    /// @return referencePrice_ = Quantity of _quoteAsset per whole _baseAsset
    /// @return decimals_ = Decimal places for _quoteAsset
    function getReferencePriceInfo(address _baseAsset, address _quoteAsset)
        public
        view
        returns (uint256 referencePrice_, uint256 decimals_)
    {
        bool isValid;
        (
            isValid,
            referencePrice_,
            decimals_
        ) = getRawReferencePriceInfo(_baseAsset, _quoteAsset);
        require(isValid, "getReferencePriceInfo: Price is not valid");
        return (referencePrice_, decimals_);
    }

    function getRawReferencePriceInfo(address _baseAsset, address _quoteAsset)
        public
        view
        returns (bool isValid_, uint256 referencePrice_, uint256 quoteDecimals_)
    {
        isValid_ = hasValidPrice(_baseAsset) && hasValidPrice(_quoteAsset);
        quoteDecimals_ = ERC20WithFields(_quoteAsset).decimals();

        if (prices[_quoteAsset] == 0) {
            return (false, 0, 0);  // return early and avoid revert
        }

        referencePrice_ = mul(
            prices[_baseAsset],
            10 ** uint256(quoteDecimals_)
        ) / prices[_quoteAsset];

        return (isValid_, referencePrice_, quoteDecimals_);
    }

    function getPriceInfo(address _asset)
        public
        view
        returns (uint256 price_, uint256 assetDecimals_)
    {
        return getReferencePriceInfo(_asset, QUOTE_ASSET);
    }

    /// @notice Gets inverted price of an asset
    /// @dev Asset has been initialised and its price is non-zero
    /// @param _asset = Asset for which inverted price should be return
    /// @return invertedPrice_ = Price based (instead of quoted) against QUOTE_ASSET
    /// @return assetDecimals_ = Decimal places for this asset
    function getInvertedPriceInfo(address _asset)
        public
        view
        returns (uint256 invertedPrice_, uint256 assetDecimals_)
    {
        return getReferencePriceInfo(QUOTE_ASSET, _asset);
    }

    /// @dev Get Kyber representation of ETH if necessary
    function getKyberMaskAsset(address _asset) public view returns (address) {
        if (_asset == registry.nativeAsset()) {
            return KYBER_ETH_TOKEN;
        }
        return _asset;
    }

    /// @notice Returns validity and price from Kyber
    function getKyberPrice(address _baseAsset, address _quoteAsset)
        public
        view
        returns (bool, uint256)
    {
        uint256 bidRate;
        uint256 bidRateOfReversePair;
        (bidRate,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            getKyberMaskAsset(_baseAsset),
            getKyberMaskAsset(_quoteAsset),
            registry.getReserveMin(_baseAsset)
        );
        (bidRateOfReversePair,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            getKyberMaskAsset(_quoteAsset),
            getKyberMaskAsset(_baseAsset),
            registry.getReserveMin(_quoteAsset)
        );

        if (bidRate == 0 || bidRateOfReversePair == 0) {
            return (false, 0);  // return early and avoid revert
        }

        uint256 askRate = 10 ** (KYBER_PRECISION * 2) / bidRateOfReversePair;
        /**
          Average the bid/ask prices:
          avgPriceFromKyber = (bidRate + askRate) / 2
          kyberPrice = (avgPriceFromKyber * 10^quoteDecimals) / 10^kyberPrecision
          or, rearranged:
          kyberPrice = ((bidRate + askRate) * 10^quoteDecimals) / 2 * 10^kyberPrecision
        */
        uint256 kyberPrice = mul(
            add(bidRate, askRate),
            10 ** uint256(ERC20WithFields(_quoteAsset).decimals()) // use original quote decimals (not defined on mask)
        ) / mul(2, 10 ** uint256(KYBER_PRECISION));

        // Find the "quoted spread", to inform caller whether it is below maximum
        uint256 spreadFromKyber;
        if (bidRate > askRate) {
            spreadFromKyber = 0; // crossed market condition
        } else {
            spreadFromKyber = mul(
                sub(askRate, bidRate),
                10 ** uint256(KYBER_PRECISION)
            ) / askRate;
        }

        return (
            spreadFromKyber <= maxSpread && bidRate != 0 && askRate != 0,
            kyberPrice
        );
    }

    /// @notice Returns price as determined by an order
    /// @param _sellAsset = Address of the asset to be sold
    /// @param _sellQuantity = Quantity (in base units) of _sellAsset being sold
    /// @param _buyQuantity = Quantity (in base units) of _buyAsset being bought
    function getOrderPriceInfo(
        address _sellAsset,
        uint256 _sellQuantity,
        uint256 _buyQuantity
    )
        public
        view
        returns (uint256)
    {
        return mul(
            _buyQuantity,
            10 ** uint256(ERC20WithFields(_sellAsset).decimals())
        ) / _sellQuantity;
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param _sellAsset = Asset for which check to be done if data exists
    /// @param _buyAsset = Asset for which check to be done if data exists
    function existsPriceOnAssetPair(address _sellAsset, address _buyAsset)
        public
        view
        returns (bool)
    {
        return hasValidPrice(_sellAsset) && hasValidPrice(_buyAsset);
    }

    /// @notice Get quantity of _toAsset equal in value to some quantity of _fromAsset
    function convertQuantity(
        uint256 _fromAssetQuantity,
        address _fromAsset,
        address _toAsset
    )
        public
        view
        returns (uint256)
    {
        uint256 fromAssetPrice;
        (fromAssetPrice,) = getReferencePriceInfo(_fromAsset, _toAsset);
        uint256 fromAssetDecimals = ERC20WithFields(_fromAsset).decimals();
        return mul(
            _fromAssetQuantity,
            fromAssetPrice
        ) / (10 ** uint256(fromAssetDecimals));
    }
}
