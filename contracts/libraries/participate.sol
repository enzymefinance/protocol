pragma solidity ^0.4.11;

/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
library participate {

    struct Request {    // subscription request
        address owner;
        bool isOpen;
        uint256 numShares;
        uint256 offeredValue;
        uint256 incentive;
        uint256 lastFeedUpdateId;
        uint256 lastFeedUpdateTime;
        uint256 timestamp;
    }

    // FIELDS

    // PRE, POST, INVARIANT CONDITIONS

    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isAtLeast(uint x, uint y) internal returns (bool) { return x >= y; }

    /// Pre: Request ID
    /// Post: Boolean dependent on market data
    /// Post: Boolean dependent on personel data; Compliance
    function isSubscribeRequestPermitted(uint id) returns (bool) {
        // Restrict to certain addresses, amounts or timeintervalls
        return true;
    }

    // Pre: Request ID
    // Post: Boolean whether permitted or not
    function isRedeemRequestPermitted(uint id) returns (bool) {
        return true;
    }

}
