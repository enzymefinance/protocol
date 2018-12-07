pragma solidity ^0.4.21;

/// @dev Simplified for testing, and by default rigged to always return true
contract MockRegistry {

    bool public alwaysRegistered = true;

    mapping (address => bool) public registered;

    function register(address _addr) {
        registered[_addr] = true;
    }

    function remove(address _addr) {
        delete registered[_addr];
    }

    function assetIsRegistered(address _asset) view returns (bool) {
        return alwaysRegistered || registered[_asset];
    }

    function exchangeIsRegistered(address _exchange) view returns (bool) {
        return alwaysRegistered || registered[_exchange];
    }
}

