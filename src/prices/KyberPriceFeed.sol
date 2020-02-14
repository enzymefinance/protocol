pragma solidity 0.6.1;

import "../dependencies/token/IERC20.sol";
import "../dependencies/DSMath.sol";
import "../dependencies/DSAuth.sol"; // TODO: remove? this may not be used at all
import "../exchanges/interfaces/IKyberNetworkProxy.sol";
import "../version/Registry.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
contract KyberPriceFeed is DSMath, DSAuth {
    event PriceUpdate(address[] token, uint[] price);

    address public KYBER_NETWORK_PROXY;
    address public QUOTE_ASSET;
    address public UPDATER;
    Registry public REGISTRY;
    uint public MAX_SPREAD;
    address public constant KYBER_ETH_TOKEN = address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint public constant KYBER_PRECISION = 18;
    uint public constant VALIDITY_INTERVAL = 2 days;
    uint public lastUpdate;

    // FIELDS

    mapping (address => uint) public prices;

    // METHODS

    // CONSTRUCTOR

    /// @dev Define and register a quote asset against which all prices are measured/based against
    constructor(
        address ofRegistry,
        address ofKyberNetworkProxy,
        uint ofMaxSpread,
        address ofQuoteAsset,
        address initialUpdater
    )
        public
    {
        KYBER_NETWORK_PROXY = ofKyberNetworkProxy;
        MAX_SPREAD = ofMaxSpread;
        QUOTE_ASSET = ofQuoteAsset;
        REGISTRY = Registry(ofRegistry);
        UPDATER = initialUpdater;
    }

    /// @dev Stores zero as a convention for invalid price
    function update() external {
        require(
            msg.sender == REGISTRY.owner() || msg.sender == UPDATER,
            "Only registry owner or updater can call"
        );
        address[] memory assets = REGISTRY.getRegisteredAssets();
        uint[] memory newPrices = new uint[](assets.length);
        for (uint i; i < assets.length; i++) {
            bool isValid;
            uint price;
            if (assets[i] == QUOTE_ASSET) {
                isValid = true;
                price = 1 ether;
            } else {
                (isValid, price) = getKyberPrice(assets[i], QUOTE_ASSET);
            }
            newPrices[i] = isValid ? price : 0;
            prices[assets[i]] = newPrices[i];
        }
        lastUpdate = block.timestamp;
        emit PriceUpdate(assets, newPrices);
    }

    function setUpdater(address _updater) external {
        require(msg.sender == REGISTRY.owner(), "Only registry owner can set");
        UPDATER = _updater;
    }

    /// @notice _maxSpread becomes a percentage when divided by 10^18
    /// @notice (e.g. 10^17 becomes 10%)
    function setMaxSpread(uint _maxSpread) external {
        require(msg.sender == REGISTRY.owner(), "Only registry owner can set");
        MAX_SPREAD = _maxSpread;
    }

    // PUBLIC VIEW METHODS

    // FEED INFORMATION

    function getQuoteAsset() public view returns (address) { return QUOTE_ASSET; }

    // PRICES

    /**
    @notice Gets price of an asset multiplied by ten to the power of assetDecimals
    @dev Asset has been registered
    @param _asset Asset for which price should be returned
    @return price Price formatting: mul(exchangePrice, 10 ** decimal), to avoid floating numbers
    @return timestamp When the asset's price was updated
    }
    */
    function getPrice(address _asset)
        public
        view
        returns (uint price, uint timestamp)
    {
        (price, ) =  getReferencePriceInfo(_asset, QUOTE_ASSET);
        timestamp = now;
    }

    function getPrices(address[] memory _assets)
        public
        view
        returns (uint256[] memory, uint256[] memory)
    {
        uint[] memory newPrices = new uint[](_assets.length);
        uint[] memory timestamps = new uint[](_assets.length);
        for (uint i; i < _assets.length; i++) {
            (newPrices[i], timestamps[i]) = getPrice(_assets[i]);
        }
        return (newPrices, timestamps);
    }

    function hasValidPrice(address _asset)
        public
        view
        returns (bool)
    {
        bool isRegistered = REGISTRY.assetIsRegistered(_asset);
        bool isFresh = block.timestamp < add(lastUpdate, VALIDITY_INTERVAL);
        return prices[_asset] != 0 && isRegistered && isFresh;
    }

    function hasValidPrices(address[] memory _assets)
        public
        view
        returns (bool)
    {
        for (uint i; i < _assets.length; i++) {
            if (!hasValidPrice(_assets[i])) {
                return false;
            }
        }
        return true;
    }

    /**
    @param _baseAsset Address of base asset
    @param _quoteAsset Address of quote asset
    @return referencePrice Quantity of quoteAsset per whole baseAsset
    @return decimals Decimal places for quoteAsset
    }
    */
    function getReferencePriceInfo(address _baseAsset, address _quoteAsset)
        public
        view
        returns (uint referencePrice, uint decimals)
    {
        bool isValid;
        (
            isValid,
            referencePrice,
            decimals
        ) = getRawReferencePriceInfo(_baseAsset, _quoteAsset);
        require(isValid, "Price is not valid");
        return (referencePrice, decimals);
    }

    function getRawReferencePriceInfo(address _baseAsset, address _quoteAsset)
        public
        view
        returns (bool isValid, uint256 referencePrice, uint256 decimals)
    {
        isValid = hasValidPrice(_baseAsset) && hasValidPrice(_quoteAsset);
        uint256 quoteDecimals = ERC20WithFields(_quoteAsset).decimals();

        if (prices[_quoteAsset] == 0) {
            return (false, 0, 0);  // return early and avoid revert
        }

        referencePrice = mul(
            prices[_baseAsset],
            10 ** uint(quoteDecimals)
        ) / prices[_quoteAsset];

        return (isValid, referencePrice, quoteDecimals);
    }

    function getPriceInfo(address _asset)
        public
        view
        returns (uint256 price, uint256 assetDecimals)
    {
        return getReferencePriceInfo(_asset, QUOTE_ASSET);
    }

    /**
    @notice Gets inverted price of an asset
    @dev Asset has been initialised and its price is non-zero
    @param _asset Asset for which inverted price should be return
    @return invertedPrice Price based (instead of quoted) against QUOTE_ASSET
    @return assetDecimals Decimal places for this asset
    }
    */
    function getInvertedPriceInfo(address _asset)
        public
        view
        returns (uint256 invertedPrice, uint256 assetDecimals)
    {
        return getReferencePriceInfo(QUOTE_ASSET, _asset);
    }

    /// @dev Get Kyber representation of ETH if necessary
    function getKyberMaskAsset(address _asset) public view returns (address) {
        if (_asset == REGISTRY.nativeAsset()) {
            return KYBER_ETH_TOKEN;
        }
        return _asset;
    }

    /// @notice Returns validity and price from Kyber
    function getKyberPrice(address _baseAsset, address _quoteAsset)
        public
        view
        returns (bool, uint)
    {
        uint bidRate;
        uint bidRateOfReversePair;
        (bidRate,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            getKyberMaskAsset(_baseAsset),
            getKyberMaskAsset(_quoteAsset),
            REGISTRY.getReserveMin(_baseAsset)
        );
        (bidRateOfReversePair,) = IKyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(
            getKyberMaskAsset(_quoteAsset),
            getKyberMaskAsset(_baseAsset),
            REGISTRY.getReserveMin(_quoteAsset)
        );

        if (bidRate == 0 || bidRateOfReversePair == 0) {
            return (false, 0);  // return early and avoid revert
        }

        uint askRate = 10 ** (KYBER_PRECISION * 2) / bidRateOfReversePair;
        /**
          Average the bid/ask prices:
          avgPriceFromKyber = (bidRate + askRate) / 2
          kyberPrice = (avgPriceFromKyber * 10^quoteDecimals) / 10^kyberPrecision
          or, rearranged:
          kyberPrice = ((bidRate + askRate) * 10^quoteDecimals) / 2 * 10^kyberPrecision
        */
        uint kyberPrice = mul(
            add(bidRate, askRate),
            10 ** uint(ERC20WithFields(_quoteAsset).decimals()) // use original quote decimals (not defined on mask)
        ) / mul(2, 10 ** uint(KYBER_PRECISION));

        // Find the "quoted spread", to inform caller whether it is below maximum
        uint spreadFromKyber;
        if (bidRate > askRate) {
            spreadFromKyber = 0; // crossed market condition
        } else {
            spreadFromKyber = mul(
                sub(askRate, bidRate),
                10 ** uint(KYBER_PRECISION)
            ) / askRate;
        }

        return (
            spreadFromKyber <= MAX_SPREAD && bidRate != 0 && askRate != 0,
            kyberPrice
        );
    }

    /// @notice Gets price of Order
    /// @param sellAsset Address of the asset to be sold
    /// @param sellQuantity Quantity in base units being sold of sellAsset
    /// @param buyQuantity Quantity in base units being bought of buyAsset
    /// @return orderPrice Price as determined by an order
    function getOrderPriceInfo(
        address sellAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        public
        view
        returns (uint orderPrice)
    {
        // TODO: decimals
        return mul(buyQuantity, 10 ** uint(ERC20WithFields(sellAsset).decimals())) / sellQuantity;
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param sellAsset Asset for which check to be done if data exists
    /// @param buyAsset Asset for which check to be done if data exists
    function existsPriceOnAssetPair(address sellAsset, address buyAsset)
        public
        view
        returns (bool)
    {
        return
            hasValidPrice(sellAsset) && // Is tradable asset (TODO cleaner) and datafeed delivering data
            hasValidPrice(buyAsset);
    }

    /// @notice Get quantity of toAsset equal in value to given quantity of fromAsset
    function convertQuantity(
        uint fromAssetQuantity,
        address fromAsset,
        address toAsset
    )
        public
        view
        returns (uint)
    {
        uint fromAssetPrice;
        (fromAssetPrice,) = getReferencePriceInfo(fromAsset, toAsset);
        uint fromAssetDecimals = ERC20WithFields(fromAsset).decimals();
        return mul(
            fromAssetQuantity,
            fromAssetPrice
        ) / (10 ** uint(fromAssetDecimals));
    }

    function getLastUpdate() public view returns (uint) { return lastUpdate; }
}
