pragma solidity ^0.4.8;

/// @title UniverseProtocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying
/// Universe Contract
contract UniverseProtocol {

    function etherTokenAtIndex() constant returns (uint) {}
    function numAssignedAssets() constant returns (uint) {}
    function assetAt(uint index) constant returns (address) {}
    function priceFeedAt(uint index) constant returns (address) {}
    function exchangeAt(uint index) constant returns (address) {}
    function assetAvailability(address ofAsset) constant returns(bool) {}
    function assignedExchange(address ofAsset) constant returns (address) {}

}
