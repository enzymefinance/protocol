pragma solidity ^0.4.11;

/// @title DataFeed Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice DataFeed according to the Standard Data Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as a protocol on how to access the underlying DataFeed Contract
contract DataFeedInterface {

    // CONSTANT METHODS

    // Get price feed specific information
    function getQuoteAsset() constant returns (address) {}
    function getInterval() constant returns (uint) {}
    function getValidity() constant returns (uint) {}
    function getLatestUpdateId() constant returns (uint) {}
    function getLatestUpdateTimestamp() constant returns (uint) {}
    // Get registartion specific information
    function isSet(address ofAsset) constant returns (bool) {}
    function numRegisteredAssets() constant returns (uint) {}
    function getRegisteredAssetAt(uint id) constant returns (address) {}
    // Get asset specific information
    function getName(address ofAsset) constant returns (string) {}
    function getSymbol(address ofAsset) constant returns (string) {}
    function getDecimals(address ofAsset) constant returns (uint256) {}
    function getDescriptiveInformation(address ofAsset) constant returns (string, string, uint256, string, bytes32) {}
    function getSpecificInformation(address ofAsset) constant returns (uint256, bytes32, address, address) {}
    // Get data feed specific information
    function isValid(address ofAsset) constant returns (bool) {}
    function getPrice(address ofAsset) constant returns (uint) {}
    function getTimestamp(address ofAsset) constant returns (uint) {}
    function getData(address ofAsset) constant returns (uint, uint) {}

    // EVENTS

    event PriceUpdated(uint id);
}
