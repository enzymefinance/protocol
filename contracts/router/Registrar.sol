pragma solidity ^0.4.4;

import "./RegistrarProtocol.sol";
import "../dependencies/SafeMath.sol";

/// @title Registrar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes internal data to smart-contracts
/// @notice Simple Registrar Contract, no adding of assets, no asset specific functionality.
contract Registrar is RegistrarProtocol, SafeMath {

    // FILEDS

    address public owner = msg.sender;
    address[] public assets;
    address[] public priceFeeds;
    address[] public exchanges;

    mapping (address => bool) isAssetAvailable;
    mapping (address => address) assignedExchanges; // exchange available for certain asset

    // EVENTS

    // MODIFIERS

    modifier maps_equal(address[] x, address[] y, address[] z) {
        assert(x.length == y.length && y.length == z.length);
        _;
    }

    // CONSTANT METHDOS

    function numAssignedAssets() constant returns (uint) { return assets.length; }

    function lookupAvailability(address ofAsset) constant returns(bool) { return isAssetAvailable[ofAsset]; }

    function lookupAssignedExchange(address ofAsset) constant returns (address) { return assignedExchanges[ofAsset]; }

    // NON-CONSTANT METHODS

    function Registrar(address[] ofAssets, address[] ofPriceFeeds, address[] ofExchanges)
        maps_equal(ofAssets, ofPriceFeeds, ofExchanges)
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            isAssetAvailable[ofAssets[i]] = true;
            assets.push(ofAssets[i]);
            priceFeeds.push(ofPriceFeeds[i]);
            exchanges.push(ofExchanges[i]);
            assignedExchanges[ofAssets[i]] = ofExchanges[i];
        }
    }
}
