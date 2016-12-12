pragma solidity ^0.4.4;

import "./RegistrarProtocol.sol";
import "../dependencies/SafeMath.sol";
import "../dependencies/Owned.sol";

/// @title Registrar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple Registrar Contract, no adding of assets, no asset specific functionality.
contract Registrar is RegistrarProtocol, SafeMath, Owned {

    // FILEDS

    // Constant fields
    uint public constant ETHER_TOKEN_INDEX = 0;

    // Fields that can be changed by functions
    address[] public assets;
    address[] public priceFeeds;
    address[] public exchanges;
    mapping (address => bool) assetAvailabilities;
    mapping (address => address) assignedExchanges; // exchange available for certain asset

    // EVENTS

    // MODIFIERS

    modifier arrays_equal(address[] x, address[] y, address[] z) {
        assert(x.length == y.length && y.length == z.length);
        _;
    }

    modifier array_not_empty(address[] x) {
        assert(x.length >= 1);
        _;
    }
    // CONSTANT METHDOS

    function numAssignedAssets() constant returns (uint) { return assets.length; }

    function assetAt(uint index) constant returns (address) { return assets[index]; }

    function priceFeedsAt(uint index) constant returns (address) { return priceFeeds[index]; }

    function availability(address ofAsset) constant returns (bool) { return assetAvailabilities[ofAsset]; }

    function assignedExchange(address ofAsset) constant returns (address) { return assignedExchanges[ofAsset]; }

    // NON-CONSTANT METHODS

    /// Pre: Assign EtherToken at index 0 of "ofAssets"
    function Registrar(address[] ofAssets, address[] ofPriceFeeds, address[] ofExchanges)
        arrays_equal(ofAssets, ofPriceFeeds, ofExchanges)
        array_not_empty(ofAssets)
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            assetAvailabilities[ofAssets[i]] = true;
            assets.push(ofAssets[i]);
            priceFeeds.push(ofPriceFeeds[i]);
            exchanges.push(ofExchanges[i]);
            assignedExchanges[ofAssets[i]] = ofExchanges[i];
        }
    }
}
