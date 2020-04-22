pragma solidity 0.6.4;

import "../dependencies/token/IERC20.sol";
import "../dependencies/DSMath.sol";

/// @notice Intended for testing purposes only
/// @notice Updates and exposes price information
contract TestingPriceFeed is DSMath {
    event PricesUpdated(address[] assets, uint256[] pricest);

    struct Data {
        uint256 price;
        uint256 timestamp;
    }

    address public QUOTE_ASSET;
    mapping(address => uint256) public assetsToDecimals;
    mapping(address => Data) public assetsToPrices;
    uint256 public lastUpdate;
    bool mockIsRecent = true;
    bool neverValid = false;

    constructor(address _quoteAsset, uint256 _quoteDecimals) public {
        QUOTE_ASSET = _quoteAsset;
        setDecimals(_quoteAsset, _quoteDecimals);
    }

    // STATE-CHANGING FUNCTIONS

    // Input price is how much quote asset you get for one unit of _asset (10**assetDecimals)
    function update(address[] calldata _assets, uint256[] calldata _prices) external {
        require(_assets.length == _prices.length, "Array lengths unequal");
        for (uint256 i = 0; i < _assets.length; ++i) {
            assetsToPrices[_assets[i]] = Data({
                timestamp: block.timestamp,
                price: _prices[i]
            });
        }
        lastUpdate = block.timestamp;
        emit PricesUpdated(_assets, _prices);
    }

    function setNeverValid(bool _state) external { neverValid = _state; }
    function setIsRecent(bool _state) external { mockIsRecent = _state; }
    function setDecimals(address _asset, uint256 _decimal) public {
        assetsToDecimals[_asset] = _decimal;
    }
    function batchSetDecimals(address[] memory _assets, uint256[] memory _decimals) public {
        require(_assets.length == _decimals.length, "Array lengths unequal");
        for (uint256 i = 0; i < _assets.length; i++) {
            setDecimals(_assets[i], _decimals[i]);
        }
    }

    // VIEW FUNCTIONS

    // PRICES

    function getPrice(address _asset)
        public
        view
        returns (uint256, uint256)
    {
        Data storage data = assetsToPrices[_asset];
        return (data.price, data.timestamp);
    }

    function getPrices(address[] memory _assets)
        public
        view
        returns (uint256[] memory, uint256[] memory)
    {
        uint256[] memory prices = new uint256[](_assets.length);
        uint256[] memory timestamps = new uint256[](_assets.length);
        for (uint256 i; i < _assets.length; i++) {
            uint256 price;
            uint256 timestamp;
            (price, timestamp) = getPrice(_assets[i]);
            prices[i] = price;
            timestamps[i] = timestamp;
        }
        return (prices, timestamps);
    }

    function getPriceInfo(address _asset) public view returns (uint256, uint256) {
        uint256 price;
        (price,) = getPrice(_asset);
        return (price, assetsToDecimals[_asset]);
    }

    function getReferencePriceInfo(address _base, address _quote)
        public
        view
        returns (uint256, uint256)
    {
        uint256 quoteDecimals = assetsToDecimals[_quote];

        require(hasValidPrice(_base) && hasValidPrice(_quote), "Price not valid");
        // Price of 1 unit for the pair of same asset
        if (_base == _quote) {
            return (10 ** uint256(quoteDecimals), quoteDecimals);
        }

        uint256 referencePrice = mul(
            assetsToPrices[_base].price,
            10 ** uint256(quoteDecimals)
        ) / assetsToPrices[_quote].price;

        return (referencePrice, quoteDecimals);
    }

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
            10 ** uint256(assetsToDecimals[_sellAsset])
        ) / _sellQuantity;
    }

    /// @notice Doesn't check validity as TestingPriceFeed has no validity variable
    /// @param _asset Asset in registrar
    function hasValidPrice(address _asset)
        public
        view
        returns (bool)
    {
        uint256 price;
        (price, ) = getPrice(_asset);
        return !neverValid && price != 0;
    }

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

    /// @notice Get quantity of _toAsset equal in value to given quantity of _fromAsset
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
