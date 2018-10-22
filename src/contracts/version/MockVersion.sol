pragma solidity ^0.4.21;

/// @notice Version contract useful for testing
contract MockVersion {
    uint public amguPrice;

    function setAmguPrice(uint _price) {
        amguPrice = _price;
    }

    function getAmguPrice() returns (uint) {
        return amguPrice;
    }

    function isFund(address _who) returns (bool) {
        return true;
    }
}
