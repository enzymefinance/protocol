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

    function register(address _addr) public {
        registered[_addr] = true;
        assets.push(_addr);
    }

    function remove(address _addr) public {
        delete registered[_addr];
    }

    function assetIsRegistered(address _asset) public view returns (bool) {
        return alwaysRegistered || registered[_asset];
    }

    function exchangeIsRegistered(address _exchange) public view returns (bool) {
        return alwaysRegistered || registered[_exchange];
    }

    function registerAdapterForExchange(
        address _exchange,
        address _adapter
    ) public {
        adapterForExchange[_exchange] = _adapter;
    }

    function exchangeMethodIsAllowed(
        address _exchange,
        bytes4 _sig
    ) public view returns (bool) { return methodAllowed; }

    function setPriceSource(address _a) public { priceSource = _a; }
    function setMlnToken(address _a) public { mlnToken = _a; }
    function setNativeAsset(address _a) public { nativeAsset = _a; }
    function setEngine(address _a) public { engine = _a; }
    function setFundFactory(address _a) public { fundFactory = _a; }
    function setIsFund(address _who) public { fundExists[_who] = true; }

    function isFund(address _who) public view returns (bool) { return fundExists[_who]; }
    function isFundFactory(address _who) public view returns (bool) {
        return _who == fundFactory;
    }
    function getRegisteredAssets() public view returns (address[]) { return assets; }
    function getReserveMin(address _asset) public view returns (uint) { return 0; }
}

