pragma solidity ^0.4.4;

import "./PriceFeedProtocol.sol";


/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Price Feed.
contract PriceFeed is PriceFeedProtocol {

    modifier noEther() { if (msg.value > 0) throw; _; }
    modifier onlyOwner { if (msg.sender != owner) throw; _; }

    mapping (address => uint) prices;

    function PriceFeed() {}
    function () { throw; }

    /// Set price of fundigle asset relative to Ether
    /** Ex:
     *  Let asset == UST, let Value of 1 UST == 0.080456789 ETH
     *  and let precision == 8,
     *  => prices[UST] = 08045678
     */
    function setPrice(address _asset, uint _price) noEther onlyOwner returns (bool) {
        prices[_asset] = _price;
        return true;
    }

    /// Get price of fundigle asset relative to Ether with Precision _pricePrecision
    function getPrice(address _asset) constant returns (uint) {
        if (msg.value >= fee)
            return prices[_asset];
        return 0;
    }

    function setFee(uint256 _fee) noEther onlyOwner returns (uint) {
        fee = _fee;
    }

    function payOut() noEther onlyOwner {
        if(!msg.sender.send(this.balance)) throw;
    }
}
