pragma solidity ^0.4.4;

import "./PriceFeedProtocol.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart-contracts
contract PriceFeed is PriceFeedProtocol {

    // FILEDS

    address public OWNER = msg.sender;
    uint public fee = 0;
    uint public precision = 8; // Precision of price
    uint public lastUpdate;
    mapping (address => uint) m_price; // Address of fungible => price of fungible
    mapping (address => uint) m_timestamp; // Address of fungible => price of fungible


    // EVENTS

    // MODIFIERS

    modifier onlyOwner {
        if (msg.sender != OWNER) throw;
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
    function getPrice(address _asset)
        constant
        msg_value_at_least(fee)
        returns (uint)
    {
        return m_price[_asset];
    }

    // NON-CONSTANT METHODS

    function PriceFeed() {}

    /// Set price of fungible relative to Ether
    /** Ex:
     *  Let asset == UST, let Value of 1 UST := 1 USD == 0.080456789 ETH
     *  and let precision == 8,
     *  => m_price[UST] = 08045678
     */
    function setPrice(address[] assets, uint[] prices)
        onlyOwner
        maps_equal(assets, prices)
    {
        lastUpdate = now;
        for (uint i = 0; i < assets.length; ++i) {
            m_price[assets[i]] = prices[i];
            m_timestamp[assets[i]] = now;
        }
    }

    function setFee(uint256 newFee) onlyOwner returns (uint) {
        fee = newFee;
    }

    function payOut() onlyOwner {
        if(!msg.sender.send(this.balance)) throw;
    }
}
