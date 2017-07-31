pragma solidity ^0.4.11;

/// @title UniverseProtocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying
/// Universe Contract
contract UniverseProtocol {
    function getQuoteAsset() constant returns (address) {}
    function numAssignedAssets() constant returns (uint) {}
    function getAssetAt(uint id) constant returns (address) {}
    function getPriceFeed() constant returns (address) {}
    function getExchange() constant returns (address) {}
    function isAssetAvailable(address ofAsset) constant returns (bool) {}
}
