pragma solidity ^0.4.11;

import "./PriceFeedProtocol.sol";
import "../dependencies/DBC.sol";
import "../dependencies/BackupOwned.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
contract PriceFeed is PriceFeedProtocol, DBC, BackupOwned {

    // TYPES

    struct Data {
        uint timestamp; // Timestamp of last price update of this asset
        uint price; // Price of asset quoted against `quoteAsset` times ten to the power of {decimals of this asset}
    }

    // FIELDS

    // Constant fields
    /// Note: Frequency is purely self imposed and for information purposes only
    uint constant frequency = 120; // Frequency of updates in seconds
    uint constant validity = 60; // Time in seconds data is considered valid

    // Fields that are only changed in constructor
    /// Note: By definition the price of the quote asset against itself (quote asset) is always equals one
    address quoteAsset; // Is the quote asset of a portfolio against which all other assets are priced against

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

    function getQuoteAsset() constant returns (address) { return quoteAsset; }
    function getFrequency() constant returns (uint) { return frequency; }
    function getValidity() constant returns (uint) { return validity; }

    // Pre: Asset has been initialised
    // Post: Returns boolean if data is valid
    function getStatus(address ofAsset)
        constant
        data_initialised(ofAsset)
        returns (bool)
    {
        return now - data[ofAsset].timestamp <= validity;
    }

    // Pre: Asset has been initialised and is active
    // Post: Price of asset, where last updated not longer than `validity` seconds ago
    function getPrice(address ofAsset)
        constant
        data_initialised(ofAsset)
        data_still_valid(ofAsset)
        returns (uint)
    {
        return data[ofAsset].price;
    }

    // Pre: Asset has been initialised and is active
    // Post: Timestamp and price of asset, where last updated not longer than `validity` seconds ago
    function getData(address ofAsset)
        constant
        data_initialised(ofAsset)
        data_still_valid(ofAsset)
        returns (uint, uint)
    {
        return (data[ofAsset].timestamp, data[ofAsset].price);
    }

    // NON-CONSTANT METHODS

    /// Pre: Define a quote asset against which all prices are measured/based against
    /// Post: Price Feed contract w Backup Owner
    function PriceFeed(address setBackupOwner, address setQuoteAsset)
        BackupOwned(setBackupOwner)
    {
        quoteAsset = setQuoteAsset;
    }

    /// Pre: Only Owner; Same sized input arrays
    /// Post: Update price of asset relative to quoteAsset
    /** Ex:
     *  Let quoteAsset == ETH (in Wei), let asset == EUR-T, let Value of 1 EUR-T := 1 EUR == 0.080456789 ETH
     *  and let EUR-T decimals == 8,
     *  => data[EUR-T].price = 8045678 [Wei/ (EUR-T * 10**8)]
     */
    function updatePrice(address[] ofAssets, uint[] newPrices)
        pre_cond(isOwner())
        arrays_equal(ofAssets, newPrices)
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            assert(data[ofAssets[i]].timestamp != now); // Intended to prevent several updates w/in one block, eg w different prices
            data[ofAssets[i]] = Data({
                timestamp: now,
                price: newPrices[i],
            });
            PriceUpdated(ofAssets[i], now, newPrices[i]);
        }
    }
}
