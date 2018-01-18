pragma solidity ^0.4.19;

/// @title PriceFeed Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice PriceFeed according to the Standard Price Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as an interface on how to access the underlying PriceFeed Contract
interface PriceFeedInterface {

    // EVENTS

    event PriceUpdated(uint timestamp);

    // PUBLIC METHODS

    function update(address[] ofAssets, uint[] newPrices);

    // PUBLIC VIEW METHODS

    // Get asset specific information
    function getName(address ofAsset) view returns (string);
    function getSymbol(address ofAsset) view returns (string);
    function getDecimals(address ofAsset) view returns (uint);
    // Get price feed operation specific information
    function getQuoteAsset() view returns (address);
    function getInterval() view returns (uint);
    function getValidity() view returns (uint);
    function getLastUpdateId() view returns (uint);
    // Get asset specific information as updated in price feed
    function hasRecentPrice(address ofAsset) view returns (bool isRecent);
    function hasRecentPrices(address[] ofAssets) view returns (bool areRecent);
    function getPrice(address ofAsset) view returns (bool isRecent, uint price, uint decimal);
    function getPrices(address[] ofAssets) view returns (bool areRecent, uint[] prices, uint[] decimals);
    function getInvertedPrice(address ofAsset) view returns (bool isRecent, uint invertedPrice, uint decimal);
    function getReferencePrice(address ofBase, address ofQuote) view returns (bool isRecent, uint referencePrice, uint decimal);
    function getOrderPrice(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    ) view returns (uint orderPrice);
    function existsPriceOnAssetPair(address sellAsset, address buyAsset) view returns (bool isExistent);
}
