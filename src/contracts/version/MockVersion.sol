pragma solidity ^0.4.25;

import "Version.i.sol";
import "Hub.sol";

/// @notice Version contract useful for testing
contract MockVersion is VersionInterface {
    uint public amguPrice;
    bool public isShutDown;

    function setAmguPrice(uint _price) public { amguPrice = _price; }
    function securityShutDown() external { isShutDown = true; }
    function shutDownFund(address _hub) external { Hub(_hub).shutDownFund(); }
    function getShutDownStatus() external returns (bool) {return isShutDown;}
    function getAmguPrice() public view returns (uint) { return amguPrice; }
}
