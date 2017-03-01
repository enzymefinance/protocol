pragma solidity ^0.4.8;

/// @title PriceFeed Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice PriceFeed according to the Standard Data Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as a protocol on how to access the underlying PriceFeed Contract
contract PriceFeedProtocol {

    // CONSTANT METHODS

    function getLastUpdate() constant returns (uint) {}
    function getPrice(address ofAsset) constant returns (uint) {}

    // NON-CONSTANT METHODS

    function updatePrice(address[] ofAssets, uint[] newPrices) {}
    function updateFee(uint256 newFee) returns (uint) {}
    function payOut() {}

}
