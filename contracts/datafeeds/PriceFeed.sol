pragma solidity ^0.4.4;

import "./PriceFeedProtocol.sol";
import "../dependencies/SafeMath.sol";
import "../dependencies/Owned.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
contract PriceFeed is PriceFeedProtocol, SafeMath, Owned {

    // FIELDS
    
    // Fields that can be changed by functions
    uint updateCounter = 0;
    uint public fee = 0;
    uint public lastUpdate;
    mapping (address => uint) assetPrices; // Address of fungible => price of fungible
    mapping (address => uint) assetTimestamps; // Address of fungible => timestamp of fungible

    // EVENTS

    event PriceSet(address indexed ofAsset, uint ofPrice, uint updateCounter);
    event PriceRequested(address indexed sender, address indexed ofAsset, uint updateCounter);

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

    function getLastUpdate() constant returns (uint) { return lastUpdate; }

    // Pre: Price of fungible has been set
    // Post: Price of asset asset relative to Ether with precision of Asset
    function getPrice(address ofAsset)
        constant
        msg_value_at_least(fee)
        returns (uint)
    {
        PriceRequested(msg.sender, ofAsset, updateCounter);
        return assetPrices[ofAsset];
    }

    // NON-CONSTANT METHODS

    function PriceFeed() {}

    /// Set price of fungible relative to Ether
    /** Ex:
     *  Let asset == EUR-T, let Value of 1 EUR-T := 1 EUR == 0.080456789 ETH
     *  and let EUR-T precision == 8,
     *  => assetPrices[EUR-T] = 08045678
     */
    function setPrice(address[] ofAssets, uint[] newPrices)
        only_owner
        arrays_equal(ofAssets, newPrices)
    {
        lastUpdate = now;
        for (uint i = 0; i < ofAssets.length; ++i) {
            assetPrices[ofAssets[i]] = newPrices[i];
            assetTimestamps[ofAssets[i]] = now;
            updateCounter += 1;
            PriceSet(ofAssets[i], newPrices[i], updateCounter);
        }
    }

    function setFee(uint256 newFee) only_owner returns (uint fee) {
        fee = newFee;
    }

    function payOut() only_owner {
        assert(msg.sender.send(this.balance));
    }
}
