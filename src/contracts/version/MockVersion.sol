pragma solidity ^0.5.13;

import "./Version.i.sol";
import "../fund/hub/Hub.sol";

/// @notice Version contract useful for testing
contract MockVersion is IVersion {
    uint public amguPrice;
    bool public isShutDown;

    function setAmguPrice(uint _price) public { amguPrice = _price; }
    function securityShutDown() external { isShutDown = true; }
    function shutDownFund(address _hub) external { Hub(_hub).shutDownFund(); }
    function getShutDownStatus() external view returns (bool) {return isShutDown;}
    function getAmguPrice() public view returns (uint) { return amguPrice; }
}
