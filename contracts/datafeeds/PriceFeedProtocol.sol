pragma solidity ^0.4.8;

/// @title PriceFeed Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice PriceFeed according to the Standard Data Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as a protocol on how to access the underlying PriceFeed Contract
contract PriceFeedProtocol {

    // CONSTANT METHODS

    function getFrequency() constant returns (uint) { return frequency; }
    function getValidity() constant returns (uint) { return validity; }
    function getUpdateCounter() constant returns (uint) { return updateCounter; }
    function getPrice(address ofAsset) constant returns (uint) { return data[ofAsset].price; }
    function getTimestamp(address ofAsset) constant returns (uint) { return data[ofAsset].timestamp; }
    function getData(address ofAsset) constant returns (uint, uint) { return (data[ofAsset].price, data[ofAsset].timestamp); }

    // NON-CONSTANT METHODS

    function updatePrice(address[] ofAssets, uint[] newPrices) {}
}
