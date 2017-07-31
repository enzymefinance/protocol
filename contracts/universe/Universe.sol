pragma solidity ^0.4.11;

import "./UniverseProtocol.sol";

/// @title Universe Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple Universe Contract, no adding of assets, no asset specific functionality.
contract Universe is UniverseProtocol {

    // TYPES

    struct Molecule {
        string name;
        string symbol;
        uint decimals;
        bool active;
    }

    // FIELDS

    // Fields that are only changed in constructor
    address public QUOTE_ASSET;
    address public PRICE_FEED;
    address public EXCHANGE;

    // Fields that can be changed by functions
    mapping (address => Molecule) public molecules; // Links asset to asset specific information
    uint256 public numOfMolecules;
    address[] public tradeableAssets;

    mapping (address => bool) assetAvailabilities;
    mapping (address => address) getPriceFeeds; // pricefeed available for certain asset
    mapping (address => address) assignedExchanges; // exchange available for certain asset

    // EVENTS

    // MODIFIERS

    // TODO DBC style
    modifier array_not_empty(address[] x) {
        assert(x.length >= 1);
        _;
    }

    // CONSTANT METHDOS

    function getQuoteAsset() constant returns (address) { return QUOTE_ASSET; }
    function numAssignedAssets() constant returns (uint) { return tradeableAssets.length; }
    function getAssetAt(uint id) constant returns (address) { return tradeableAssets[id]; }
    function getPriceFeed() constant returns (address) { return PRICE_FEED; }
    function getExchange() constant returns (address) { return EXCHANGE; }
    function isAssetAvailable(address ofAsset) constant returns (bool) {
        return molecules[ofAsset].active; // TODO test if return false
    }

    // NON-CONSTANT METHODS

    /// Pre: Assign ReferenceAsset at id 0 of "ofAssets"
    function Universe(address ofQuoteAsset, address[] ofTradeableAsset, address ofPriceFeed, address ofExchange)
        array_not_empty(ofTradeableAsset)
    {
        QUOTE_ASSET = ofQuoteAsset;
        PRICE_FEED = ofPriceFeed;
        EXCHANGE = ofExchange;
        tradeableAssets = ofTradeableAsset; // TODO use Molecules
    }
}
