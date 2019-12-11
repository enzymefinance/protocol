pragma solidity ^0.5.13;

/// @notice Token representing ownership of the Fund
interface SharesInterface {
    function createFor(address who, uint amount);
    function destroyFor(address who, uint amount);
}

interface SharesFactoryInterface {
    function createInstance(address _hub) external returns (address);
}
