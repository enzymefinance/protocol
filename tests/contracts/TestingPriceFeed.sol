pragma solidity 0.6.1;

import "main/dependencies/token/IERC20.sol";
import "main/dependencies/DSMath.sol";

/// @notice Intended for testing purposes only
/// @notice Updates and exposes price information
contract TestingPriceFeed is DSMath {
    event PriceUpdate(address[] token, uint[] price);

    struct Data {
        uint price;
        uint timestamp;
    }

    address public QUOTE_ASSET;
    uint public updateId;
    uint public lastUpdate;
    mapping(address => Data) public assetsToPrices;
    mapping(address => uint) public assetsToDecimals;
    bool mockIsRecent = true;
    bool neverValid = false;

    constructor(address _quoteAsset, uint _quoteDecimals) public {
        QUOTE_ASSET = _quoteAsset;
        setDecimals(_quoteAsset, _quoteDecimals);
    }

    /**
      Input price is how much quote asset you would get
      for one unit of _asset (10**assetDecimals)
     */
    function update(address[] calldata _assets, uint[] calldata _prices) external {
        require(_assets.length == _prices.length, "Array lengths unequal");
        updateId++;
        for (uint i = 0; i < _assets.length; ++i) {
            assetsToPrices[_assets[i]] = Data({
                timestamp: block.timestamp,
                price: _prices[i]
            });
        }
        lastUpdate = block.timestamp;
        emit PriceUpdate(_assets, _prices);
    }

    function getPrice(address ofAsset)
        public
        view
        returns (uint price, uint timestamp)
    {
        Data storage data = assetsToPrices[ofAsset];
        return (data.price, data.timestamp);
    }

    function getPrices(address[] memory ofAssets)
        public
        view
        returns (uint[] memory, uint[] memory)
    {
        uint[] memory prices = new uint[](ofAssets.length);
        uint[] memory timestamps = new uint[](ofAssets.length);
        for (uint i; i < ofAssets.length; i++) {
            uint price;
            uint timestamp;
            (price, timestamp) = getPrice(ofAssets[i]);
            prices[i] = price;
            timestamps[i] = timestamp;
        }
        return (prices, timestamps);
    }

    function getPriceInfo(address ofAsset)
        public
        view
        returns (uint price, uint assetDecimals)
    {
        (price, ) = getPrice(ofAsset);
        assetDecimals = assetsToDecimals[ofAsset];
    }

    function getInvertedPriceInfo(address ofAsset)
        public
        view
        returns (uint invertedPrice, uint assetDecimals)
    {
        uint inputPrice;
        // inputPrice quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
        (inputPrice, assetDecimals) = getPriceInfo(ofAsset);

        // outputPrice based in QUOTE_ASSET and multiplied by 10 ** quoteDecimal
        uint quoteDecimals = assetsToDecimals[QUOTE_ASSET];

        return (
            mul(
                10 ** uint(quoteDecimals),
                10 ** uint(assetDecimals)
            ) / inputPrice,
            quoteDecimals
        );
    }

    function setNeverValid(bool _state) public {
        neverValid = _state;
    }

    function setIsRecent(bool _state) public {
        mockIsRecent = _state;
    }

    // NB: not permissioned; anyone can change this in a test
    function setDecimals(address _asset, uint _decimal) public {
        assetsToDecimals[_asset] = _decimal;
    }

    // needed just to get decimals for prices
    function batchSetDecimals(address[] memory _assets, uint[] memory _decimals) public {
        require(_assets.length == _decimals.length, "Array lengths unequal");
        for (uint i = 0; i < _assets.length; i++) {
            setDecimals(_assets[i], _decimals[i]);
        }
    }

    function getReferencePriceInfo(address ofBase, address ofQuote)
        public
        view
        returns (uint referencePrice, uint decimal)
    {
        uint quoteDecimals = assetsToDecimals[ofQuote];

        bool bothValid = hasValidPrice(ofBase) && hasValidPrice(ofQuote);
        require(bothValid, "Price not valid");
        // Price of 1 unit for the pair of same asset
        if (ofBase == ofQuote) {
            return (10 ** uint(quoteDecimals), quoteDecimals);
        }

        referencePrice = mul(
            assetsToPrices[ofBase].price,
            10 ** uint(quoteDecimals)
        ) / assetsToPrices[ofQuote].price;

        return (referencePrice, quoteDecimals);
    }

    function getOrderPriceInfo(
        address sellAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        public
        view
        returns (uint orderPrice)
    {
        return mul(buyQuantity, 10 ** uint(assetsToDecimals[sellAsset])) / sellQuantity;
    }

    /// @notice Doesn't check validity as TestingPriceFeed has no validity variable
    /// @param _asset Asset in registrar
    /// @return isValid Price information ofAsset is recent
    function hasValidPrice(address _asset)
        public
        view
        returns (bool isValid)
    {
        uint price;
        (price, ) = getPrice(_asset);

        return !neverValid && price != 0;
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

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param sellAsset Asset for which check to be done if data exists
    /// @param buyAsset Asset for which check to be done if data exists
    function existsPriceOnAssetPair(address sellAsset, address buyAsset)
        public
        view
        returns (bool isExistent)
    {
        return
            hasValidPrice(sellAsset) &&
            hasValidPrice(buyAsset);
    }

    function getLastUpdateId() public view returns (uint) { return updateId; }
    function getQuoteAsset() public view returns (address) { return QUOTE_ASSET; }

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

