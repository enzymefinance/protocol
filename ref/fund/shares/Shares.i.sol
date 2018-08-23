pragma solidity ^0.4.21;

/// @notice Token representing ownership of the Fund
interface SharesInterface {
    function createFor(address who, uint amount);
    function destroyFor(address who, uint amount);
}

