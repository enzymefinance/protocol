pragma solidity ^0.4.4;

/// @title Price Feed Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Price Feed according to the Standard Data Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as a protocol on how to access the underlying
/// Price Feed Contract
contract PriceFeedProtocol {
    address public owner = msg.sender;
    uint public fee = 0;
    uint public precision = 8;  // Precision of price ticker
    function getPrice(address _asset) constant returns (uint) {}
    function setPrice(address _asset, uint _price) returns (bool) {}
    function setFee(uint256 _fee) returns (uint) {}
    function payOut() {}
}
