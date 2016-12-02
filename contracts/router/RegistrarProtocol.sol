pragma solidity ^0.4.4;

/// @title Registrar Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying
/// Registrar Contract
contract RegistrarProtocol {

    function numAssignedAssets() constant returns (uint) {}
    function assetAt(uint index) constant returns (address) {}
    function priceFeedsAt(uint index) constant returns (address) {}
    function availability(address ofAsset) constant returns(bool) {}
    function assignedExchange(address ofAsset) constant returns (address) {}

}
