pragma solidity ^0.4.21;


import "../../src/dependencies/math.sol";

/// @notice Intended for testing purposes only
/// @notice Updates and exposes price information
contract TestingPriceFeed is DSMath {

    struct Data {
        uint price;
        uint timestamp;
    }

    address public QUOTE_ASSET;
    uint public updateId;
    mapping(address => Data) public assetsToPrices;
    mapping(address => uint) public assetsToDecimals;

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
    function update(address[] _assets, uint[] _prices) {
        require(_assets.length == _prices.length);
        updateId++;
        for (uint i = 0; i < _assets.length; ++i) {
            assetsToPrices[_assets[i]].timestamp = block.timestamp;
            assetsToPrices[_assets[i]].price = _prices[i];
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

    function getPriceInfo(address ofAsset)
        view
        returns (bool isRecent, uint price, uint assetDecimals)
    {
        isRecent = true;    // NB: mock value, always recent
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
            mul(10 ** uint(quoteDecimals), 10 ** uint(assetDecimals)) / inputPrice,
            quoteDecimals   // TODO: check on this; shouldn't it be assetDecimals?
        );
    }

    function setDecimals(address _asset, uint _decimal) {
        assetsToDecimals[_asset] = _decimal;
    }

    // needed just to get decimals for prices
    function batchSetDecimals(address[] _assets, uint[] _decimals) {
        require(_assets.length == _decimals.length);
        for (uint i = 0; i < _assets.length; i++) {
            setDecimals(_assets[i], _decimals[i]);
        }
    }
}

