pragma solidity ^0.4.21;

import "../assets/PreminedAsset.sol";

/// @title Malicious Token
/// @author Melonport AG <team@melonport.com>
/// @notice Testing contract, whose functions can be made to throw on demand
contract MaliciousToken is PreminedAsset {
    bool public isThrowing = false;

    function startThrowing() {
        isThrowing = true;
    }

    function stopThrowing() {
        isThrowing = false;
    }

    function transfer(address _to, uint _value) returns (bool) {
        require(!isThrowing);
        return super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint _value) returns (bool) {
        require(!isThrowing);
        return super.transferFrom(_from, _to, _value);
    }

    function approve(address _spender, uint _value) returns (bool) {
        require(!isThrowing);
        return super.approve(_spender, _value);
    }

    function balanceOf(address _owner) view returns (uint) {
        require(!isThrowing);
        return super.balanceOf(_owner);
    }
}
