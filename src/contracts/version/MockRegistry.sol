pragma solidity ^0.4.21;

/// @dev Simplified for testing, and by default rigged to always return true
contract MockRegistry {

    bool public alwaysRegistered = true;

    address public priceSource;
    address public mlnToken;
    address public engine;
    address public fundFactory;
    mapping (address => bool) public registered;
    mapping (address => bool) public fundExists;
    mapping (address => address) public adapterForExchange;

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
    function registerAdapterForExchange(
        address _exchange,
        address _adapter
    ) {
        adapterForExchange[_exchange] = _adapter;
    }
    function setPriceSource(address _a) { priceSource = _a; }
    function setMlnToken(address _a) { mlnToken = _a; }
    function setEngine(address _a) { engine = _a; }
    function setFundFactory(address _a) { fundFactory = _a; }
    function setIsFund(address _who) { fundExists[_who] = true; }

    function isFund(address _who) returns (bool) { return fundExists[_who]; }
    function isFundFactory(address _who) returns (bool) {
        return _who == fundFactory;
    }
}

