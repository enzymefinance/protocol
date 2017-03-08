pragma solidity ^0.4.8;

import "./PriceFeedProtocol.sol";
import "../dependencies/BackupOwned.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
contract PriceFeed is PriceFeedProtocol, BackupOwned {

    // TYPES

    struct Data {
        uint timestamp; // Timestamp of last price update of this asset
        uint price; // Price of asset relative to Ether with decimals of this asset
    }

    // FIELDS

    // Constant fields
    /// Note: Frequency is purely self imposed and for information purposes only
    uint constant frequency = 120; // Frequency of updates in seconds
    uint constant validity = 60; // Time in seconds data is considered valid
    // Fields that can be changed by functions
    mapping (address => Data) data; // Address of asset => price of asset

    // MODIFIERS

    modifier msg_value_at_least(uint x) {
        assert(msg.value >= x);
        _;
    }

    modifier data_initialised(address ofAsset) {
        assert(data[ofAsset].timestamp > 0);
        _;
    }

    modifier data_still_valid(address ofAsset) {
        assert(now - data[ofAsset].timestamp <= validity);
        _;
    }

    modifier arrays_equal(address[] x, uint[] y) {
        assert(x.length == y.length);
        _;
    }

    // CONSTANT METHODS

    function getFrequency() constant returns (uint) { return frequency; }
    function getValidity() constant returns (uint) { return validity; }

    /// Pre: Checks for initialisation and inactivity
    /// Post: Price of asset, where last updated not longer than `validity` seconds ago
    function getPrice(address ofAsset)
        constant
        data_initialised(ofAsset)
        data_still_valid(ofAsset)
        returns (uint)

    {
        return data[ofAsset].price;
    }

    /// Pre: Checks for initialisation and inactivity
    /// Post: Timestamp and price of asset, where last updated not longer than `validity` seconds ago
    function getData(address ofAsset)
        constant
        data_initialised(ofAsset)
        data_still_valid(ofAsset)
        returns (uint, uint)
    {
        return (data[ofAsset].timestamp, data[ofAsset].price);
    }

    // NON-CONSTANT METHODS

    function PriceFeed(address ofBackupOwner)
        BackupOwned(ofBackupOwner)
    {}

    //// Pre: Only Owner; Same sized input arrays
    //// Post: Update price of asset relative to Ether
    /** Ex:
     *  Let asset == EUR-T, let Value of 1 EUR-T := 1 EUR == 0.080456789 ETH
     *  and let EUR-T decimals == 8,
     *  => data[EUR-T].price = 8045678
     */
    function updatePrice(address[] ofAssets, uint[] newPrices)
        only_owner
        arrays_equal(ofAssets, newPrices)
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            assert(data[ofAssets[i]].timestamp != now); // Intended to prevent several updates w/in one block, eg w different prices
            data[ofAssets[i]] = Data( now, newPrices[i] );
            PriceUpdated(ofAssets[i], now, newPrices[i]);
        }
    }
}
