pragma solidity ^0.4.19;

/// @title PriceFeed Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice PriceFeed according to the Standard Price Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as an interface on how to access the underlying PriceFeed Contract
contract PriceFeedInterface {

    // EVENTS

    event PriceUpdated(uint timestamp);

    // CONSTANT METHODS

    // Get asset specific information
    function getDescriptiveInformation(address ofAsset) constant returns (string, string, string, bytes32) {}
    function getName(address ofAsset) constant returns (string) {}
    function getSymbol(address ofAsset) constant returns (string) {}
    function getDecimals(address ofAsset) constant returns (uint) {}
    function getSpecificInformation(address ofAsset) constant returns (uint, bytes32, address, address) {}
    // Get price feed operation specific information
    function getQuoteAsset() constant returns (address) {}
    function getInterval() constant returns (uint) {}
    function getValidity() constant returns (uint) {}
    // Get asset specific information as updated in price feed
    function isValid(address ofAsset) constant returns (bool) {}
    function existsPriceOnAssetPair(address sellAsset, address buyAsset) constant returns (bool) {}
    function hasRecentPrice(address ofAsset) constant returns (bool) {}
    function getPrice(address ofAsset) constant returns (uint) {}
    function hasRecentPrices(address[] ofAssets) constant returns (bool) {}
    function getPrices(address[] ofAssets) constant returns (uint[]) {}
    function getInvertedPrice(address ofAsset) constant returns (uint) {}
    function getReferencePrice(address ofBase, address ofQuote) constant returns (uint) {}
    function getOrderPrice(address ofBase, uint sellQuantity, uint buyQuantity) constant returns (uint) {}
    function getTimestamp(address ofAsset) constant returns (uint) {}

    // NON-CONSTANT METHODS

    function update(address[] ofAssets, uint[] newPrices) {}
}
