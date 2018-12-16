pragma solidity ^0.4.21;

import "PriceSource.i.sol";
import "UpdatableFeed.i.sol";
import "math.sol";

/// @notice Intended for testing purposes only
/// @notice Updates and exposes price information
contract TestingPriceFeed is UpdatableFeedInterface, PriceSourceInterface, DSMath {

    struct Data {
        uint price;
        uint timestamp;
    }

    address public QUOTE_ASSET;
    uint public updateId;
    mapping(address => Data) public assetsToPrices;
    mapping(address => uint) public assetsToDecimals;
    bool mockIsRecent = true;

    constructor(address _quoteAsset, uint _quoteDecimals) {
        QUOTE_ASSET = _quoteAsset;
        setDecimals(_quoteAsset, _quoteDecimals);
    }

    /** Ex:
     *  Let QUOTE_ASSET == MLN (base units), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 MLN, hence price 0.080456789 MLN / EUR-T
     *  and let EUR-T decimals == 8.
     *  Input would be: information[EUR-T].price = 8045678 [MLN/ (EUR-T * 10**8)]
     */
    function update(address[] _assets, uint[] _prices) external {
        require(_assets.length == _prices.length, "Array lengths unequal");
        updateId++;
        for (uint i = 0; i < _assets.length; ++i) {
            assetsToPrices[_assets[i]] = Data({
                timestamp: block.timestamp,
                price: _prices[i]
            });
        }
    }

    function getPrice(address ofAsset) view returns (uint price, uint timestamp) {
        Data data = assetsToPrices[ofAsset];
        return (data.price, data.timestamp);
    }

    function getPrices(address[] ofAssets) view returns (uint[], uint[]) {
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

    /// @dev For testing we don't need these checks
    function safeGetPrice(address _asset) view returns (uint) {
        uint price;
        (price,) = getPrice(_asset);
        return price;
    }

    /// @dev For testing we don't need these checks
    function safeGetPrices(address[] _assets) view returns (uint[]) {
        uint[] memory prices;
        (prices,) = getPrices(_assets);
        return prices;
    }

    function getPriceInfo(address ofAsset)
        view
        returns (bool isRecent, uint price, uint assetDecimals)
    {
        isRecent = mockIsRecent;
        (price, ) = getPrice(ofAsset);
        assetDecimals = assetsToDecimals[ofAsset];
    }

    function getInvertedPriceInfo(address ofAsset)
        view
        returns (bool isRecent, uint invertedPrice, uint assetDecimals)
    {
        uint inputPrice;
        // inputPrice quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
        (isRecent, inputPrice, assetDecimals) = getPriceInfo(ofAsset);

        // outputPrice based in QUOTE_ASSET and multiplied by 10 ** quoteDecimal
        uint quoteDecimals = assetsToDecimals[QUOTE_ASSET];

        return (
            isRecent,
            mul(
                10 ** uint(quoteDecimals),
                10 ** uint(assetDecimals)
            ) / inputPrice,
            quoteDecimals   // TODO: check on this; shouldn't it be assetDecimals?
        );
    }

    function setIsRecent(bool _state) {
        mockIsRecent = _state;
    }

    // NB: not permissioned; anyone can change this in a test
    function setDecimals(address _asset, uint _decimal) {
        assetsToDecimals[_asset] = _decimal;
    }

    // needed just to get decimals for prices
    function batchSetDecimals(address[] _assets, uint[] _decimals) {
        require(_assets.length == _decimals.length, "Array lengths unequal");
        for (uint i = 0; i < _assets.length; i++) {
            setDecimals(_assets[i], _decimals[i]);
        }
    }

    function getReferencePriceInfo(address ofBase, address ofQuote)
        view
        returns (bool isRecent, uint referencePrice, uint decimal)
    {
        if (QUOTE_ASSET == ofQuote) {
            (isRecent, referencePrice, decimal) = getPriceInfo(ofBase);
        } else if (QUOTE_ASSET == ofBase) {
            (isRecent, referencePrice, decimal) = getInvertedPriceInfo(ofQuote);
        } else {
            revert("One of the parameters must be quoteAsset");
        }
    }

    function getOrderPriceInfo(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        view
        returns (uint orderPrice)
    {
        return mul(buyQuantity, 10 ** assetsToDecimals[sellAsset]) / sellQuantity;
    }

    /// @notice Doesn't check validity as TestingPriceFeed has no validity variable
    /// @param ofAsset Asset in registrar
    /// @return isRecent Price information ofAsset is recent
    function hasRecentPrice(address ofAsset)
        view
        returns (bool isRecent)
    {
        var (price, ) = getPrice(ofAsset);
        return (price != 0);
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param sellAsset Asset for which check to be done if data exists
    /// @param buyAsset Asset for which check to be done if data exists
    /// @return Whether assets exist for given asset pair
    function existsPriceOnAssetPair(address sellAsset, address buyAsset)
        view
        returns (bool isExistent)
    {
        return
            hasRecentPrice(sellAsset) &&
            hasRecentPrice(buyAsset) &&
            (buyAsset == QUOTE_ASSET || sellAsset == QUOTE_ASSET) && // One asset must be QUOTE_ASSET
            (buyAsset != QUOTE_ASSET || sellAsset != QUOTE_ASSET); // Pair must consists of diffrent assets
    }

    function getLastUpdateId() public view returns (uint) { return updateId; }
    function getQuoteAsset() public view returns (address) { return QUOTE_ASSET; }
}

