pragma solidity ^0.4.21;

import "auth.sol";

/// @dev Simplified for testing, and by default rigged to always return true
contract MockRegistry is DSAuth {

    bool public alwaysRegistered = true;
    bool public methodAllowed = true;

    address public priceSource;
    address public mlnToken;
    address public nativeAsset;
    address public engine;
    address public fundFactory;
    address[] public assets;
    mapping (address => bool) public registered;
    mapping (address => bool) public fundExists;
    mapping (address => address) public adapterForExchange;

    function register(address _addr) {
        registered[_addr] = true;
        assets.push(_addr);
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

    function exchangeMethodIsAllowed(
        address _exchange,
        bytes4 _sig
    ) view returns (bool) { return methodAllowed; }

    function setPriceSource(address _a) { priceSource = _a; }
    function setMlnToken(address _a) { mlnToken = _a; }
    function setNativeAsset(address _a) { nativeAsset = _a; }
    function setEngine(address _a) { engine = _a; }
    function setFundFactory(address _a) { fundFactory = _a; }
    function setIsFund(address _who) { fundExists[_who] = true; }

    function isFund(address _who) returns (bool) { return fundExists[_who]; }
    function isFundFactory(address _who) returns (bool) {
        return _who == fundFactory;
    }
    function getRegisteredAssets() returns (address[]) { return assets; }
    function getReserveMin(address _asset) returns (uint) { return 0; }
}

