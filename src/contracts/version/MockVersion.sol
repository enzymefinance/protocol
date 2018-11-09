pragma solidity ^0.4.21;

import "./Version.i.sol";

/// @notice Version contract useful for testing
contract MockVersion is VersionInterface {
    uint public amguPrice;
    address public fundFactory;
    mapping (address => bool) public fundExists;

    function setFundFactory(address _who) {
        fundFactory = _who;
    }

    function setAmguPrice(uint _price) {
        amguPrice = _price;
    }

    function setIsFund(address _who) {
        fundExists[_who] = true;
    }

    function getAmguPrice() returns (uint) {
        return amguPrice;
    }

    function isFund(address _who) returns (bool) {
        return fundExists[_who];
    }

    function isFundFactory(address _who) returns (bool) {
        return _who == fundFactory;
    }
}
