pragma solidity ^0.4.19;

import "../assets/PreminedAsset.sol";

/// @title Malicious Token
/// @author Melonport AG <team@melonport.com>
/// @notice Testing contract, whose functions can be made to throw on demand
contract MaliciousToken is PreminedAsset {
    bool isThrowing = false;

    function startThrowing() {
        isThrowing = true;
    }

    function stopThrowing() {
        isThrowing = false;
    }

    function tryTransfer(address _to, uint _value) returns (bool) {
        require(!isThrowing);
        return transfer(_to, _value);
    }

    function tryTransferFrom(address _from, address _to, uint _value) returns (bool) {
        require(!isThrowing);
        return transferFrom(_from, _to, _value);
    }

    function tryApprove(address _spender, uint _value) returns (bool) {
        require(!isThrowing);
        return approve(_spender, _value);
    }
}
