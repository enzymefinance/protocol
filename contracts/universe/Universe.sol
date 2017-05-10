pragma solidity ^0.4.11;

import "./UniverseProtocol.sol";
import "../dependencies/SafeMath.sol";
import "../dependencies/Owned.sol";

/// @title Universe Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple Universe Contract, no adding of assets, no asset specific functionality.
contract Universe is UniverseProtocol, SafeMath, Owned {

    // FIELDS

    // Fields that can be changed by functions
    address referenceAsset;
    address melonAsset;
    address[] public assets;
    address[] public priceFeeds;
    address[] public exchanges;
    mapping (address => bool) assetAvailabilities;
    mapping (address => address) assignedPriceFeeds; // pricefeed available for certain asset
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

    function getReferenceAsset() constant returns (address) { return referenceAsset; }
    function getMelonAsset() constant returns (address) { return melonAsset; }
    function numAssignedAssets() constant returns (uint) { return assets.length; }
    function assetAt(uint index) constant returns (address) { return assets[index]; }
    function priceFeedAt(uint index) constant returns (address) { return priceFeeds[index]; }
    function exchangeAt(uint index) constant returns (address) { return exchanges[index]; }
    function assetAvailability(address ofAsset) constant returns (bool) { return assetAvailabilities[ofAsset]; }
    function assignedPriceFeed(address ofAsset) constant returns (address) { return assignedPriceFeeds[ofAsset]; }
    function assignedExchange(address ofAsset) constant returns (address) { return assignedExchanges[ofAsset]; }

    // NON-CONSTANT METHODS

    /// Pre: Assign ReferenceAsset at index 0 of "ofAssets"
    function Universe(address[] ofAssets, address[] ofPriceFeeds, address[] ofExchanges)
        arrays_equal(ofAssets, ofPriceFeeds, ofExchanges)
        array_not_empty(ofAssets)
    {
        referenceAsset = ofAssets[0];
        melonAsset = ofAssets[1];
        for (uint i = 0; i < ofAssets.length; ++i) {
            assetAvailabilities[ofAssets[i]] = true;
            assets.push(ofAssets[i]);
            priceFeeds.push(ofPriceFeeds[i]);
            exchanges.push(ofExchanges[i]);
            assignedPriceFeeds[ofAssets[i]] = ofPriceFeeds[i];
            assignedExchanges[ofAssets[i]] = ofExchanges[i];
        }
    }
}
