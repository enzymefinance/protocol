pragma solidity ^0.5.13;

/// @dev Minimal interface for our interactions with MatchingMarket
interface IMatchingMarket {
    function getOffer(uint256 id) external view returns (uint, address, uint, address);
    function buy(uint256, uint256) external returns (bool);
    function cancel(uint256 id) external returns (bool success);
    function offer(uint256 pay_amt, address pay_gem, uint256 buy_amt, address buy_gem)
        external
        returns (uint id);
}
