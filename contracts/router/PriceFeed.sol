pragma solidity ^0.4.4;

import "./PriceFeedProtocol.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart-contracts
contract PriceFeed is PriceFeedProtocol {

    // FILEDS

    address public owner;
    uint public fee = 0;
    uint public precision = 8; // Precision of price
    uint public lastUpdate;
    mapping (address => uint) m_price; // Address of fungible => price of fungible
    mapping (address => uint) m_timestamp; // Address of fungible => price of fungible

    // EVENTS

    // MODIFIERS

    modifier onlyOwner {
        if (msg.sender != owner) throw;
        _;
    }

    modifier msg_value_at_least(uint x) {
        if (msg.value < x) throw;
        _;
    }

    modifier maps_equal(address[] x, uint[] y) {
        if (x.length != y.length) throw;
        _;
    }

    // CONSTANT METHODS

    /// Pre: Price of fungible has been set
    /// Post: Price of asset asset relative to Ether with Precision _pricePrecision
    function getPrice(address asset)
        constant
        msg_value_at_least(fee)
        returns (uint)
    {
        return m_price[asset];
    }

    // NON-CONSTANT METHODS

    function PriceFeed(address ownedBy) {
        owner = ownedBy;
    }

    /// Set price of fungible relative to Ether
    /** Ex:
     *  Let asset == UST, let Value of 1 UST := 1 USD == 0.080456789 ETH
     *  and let precision == 8,
     *  => m_price[UST] = 08045678
     */
    function setPrice(address[] fungibles, uint[] prices)
        onlyOwner
        maps_equal(fungibles, prices)
    {
        lastUpdate = now;
        for (uint i = 0; i < fungibles.length; ++i) {
            m_price[fungibles[i]] = prices[i];
            m_timestamp[fungibles[i]] = now;
        }
    }

    function setFee(uint256 newFee) onlyOwner returns (uint) {
        fee = newFee;
    }

    function payOut() onlyOwner {
        if(!msg.sender.send(this.balance)) throw;
    }
}
