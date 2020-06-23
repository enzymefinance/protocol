// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @dev Minimal interface for our interactions with OasisDex MatchingMarket
interface IOasisDex {
    event LogUnsortedOffer(uint id);
    function getFirstUnsortedOffer() external view returns(uint256);
    function getNextUnsortedOffer(uint256) external view returns(uint256);
    function getBestOffer(address, address) external view returns(uint256);
    function getOffer(uint256) external view returns (uint256, address, uint256, address);
    function getWorseOffer(uint256) external view returns(uint256);
    function isActive(uint256) external view returns (bool);
    function buy(uint256, uint256) external returns (bool);
    function cancel(uint256) external returns (bool);
    function offer(uint256, address, uint256, address) external returns (uint256);
}
