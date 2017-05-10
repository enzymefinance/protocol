pragma solidity ^0.4.11;

/// @title PriceFeed Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice PriceFeed according to the Standard Data Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as a protocol on how to access the underlying PriceFeed Contract
contract PriceFeedProtocol {

    // CONSTANT METHODS

    function getQuoteAsset() constant returns (address) {}
    function getFrequency() constant returns (uint) {}
    function getValidity() constant returns (uint) {}
    function getStatus(address ofAsset) constant returns (bool) {}
    function getPrice(address ofAsset) constant returns (uint) {}
    function getTimestamp(address ofAsset) constant returns (uint) {}
    function getData(address ofAsset) constant returns (uint, uint) {}

    // EVENTS

    event PriceUpdated(address indexed ofAsset, uint atTimestamp, uint ofPrice);

    // NON-CONSTANT METHODS

    function updatePrice(address[] ofAssets, uint[] newPrices) {}
}
