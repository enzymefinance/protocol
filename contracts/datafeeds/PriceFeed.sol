pragma solidity ^0.4.8;

import "./PriceFeedProtocol.sol";
import "../dependencies/SafeMath.sol";
import "../dependencies/Owned.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
contract PriceFeed is PriceFeedProtocol, SafeMath, Owned {

    // TYPES
    struct Data {
        uint timestamp; // Timestamp of last price update of this asset
        uint price; // Price of asset relative to Ether with decimals of this asset
    }

    // FIELDS

    // Constant fields
    uint frequency = 120; // Frequency of updates in seconds
    uint validity = 120; // After time has passed data is considered invalid.

    // Fields that can be changed by functions
    uint updateCounter = 0; // Used to track how many times data has been updated
    mapping (address => Data) data; // Address of asset => price of asset

    // EVENTS

    event PriceUpdated(address indexed ofAsset, uint ofPrice, uint ofUpdateCounter);

    // MODIFIERS

    modifier msg_value_at_least(uint x) {
        assert(msg.value >= x);
        _;
    }

    modifier arrays_equal(address[] x, uint[] y) {
        assert(x.length == y.length);
        _;
    }

    // CONSTANT METHODS

    function getFrequency() constant returns (uint) { return frequency; }
    function getValidity() constant returns (uint) { return validity; }
    function getUpdateCounter() constant returns (uint) { return updateCounter; }
    function getPrice(address ofAsset) constant returns (uint) { return data[ofAsset].price; }
    function getTimestamp(address ofAsset) constant returns (uint) { return data[ofAsset].timestamp; }
    function getData(address ofAsset) constant returns (uint, uint) { return (data[ofAsset].price, data[ofAsset].timestamp); }

    // NON-CONSTANT METHODS

    function PriceFeed() {}

    /// Pre: Only Owner; Same sized input arrays
    /// Post: Update price of asset relative to Ether
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
            data[ofAssets[i]].price = newPrices[i];
            data[ofAssets[i]].timestamp = now;
            updateCounter += 1;
            PriceUpdated(ofAssets[i], newPrices[i], updateCounter);
        }
    }
}
