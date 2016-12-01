pragma solidity ^0.4.4;

import "./PriceFeedProtocol.sol";
import "../dependencies/SafeMath.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart-contracts
contract PriceFeed is PriceFeedProtocol, SafeMath {

    // FILEDS

    address public owner = msg.sender;
    uint public fee = 0;
    uint public precision = 8; // Precision of price
    uint public lastUpdate;
    mapping (address => uint) assetPrices; // Address of fungible => price of fungible
    mapping (address => uint) assetTimestamps; // Address of fungible => price of fungible

    // EVENTS

    // MODIFIERS

    modifier onlyOwner {
        assert(msg.sender == owner);
        _;
    }

    modifier msg_value_at_least(uint x) {
        assert(msg.value >= x);
        _;
    }

    modifier maps_equal(address[] x, uint[] y) {
        assert(x.length == y.length);
        _;
    }

    // CONSTANT METHODS

    /// Pre: Price of fungible has been set
    /// Post: Price of asset asset relative to Ether with Precision _pricePrecision
    function getPrice(address ofAsset)
        constant
        msg_value_at_least(fee)
        returns (uint)
    {
        return assetPrices[ofAsset];
    }

    // NON-CONSTANT METHODS

    function PriceFeed() {}

    /// Set price of fungible relative to Ether
    /** Ex:
     *  Let asset == UST, let Value of 1 UST := 1 USD == 0.080456789 ETH
     *  and let precision == 8,
     *  => assetPrices[UST] = 08045678
     */
    function setPrice(address[] ofAssets, uint[] newPrices)
        onlyOwner
        maps_equal(ofAssets, newPrices)
    {
        lastUpdate = now;
        for (uint i = 0; i < ofAssets.length; ++i) {
            assetPrices[ofAssets[i]] = newPrices[i];
            assetTimestamps[ofAssets[i]] = now;
        }
    }

    function setFee(uint256 newFee) onlyOwner returns (uint fee) {
        fee = newFee;
    }

    function payOut() onlyOwner {
        assert(msg.sender.send(this.balance));
    }
}
