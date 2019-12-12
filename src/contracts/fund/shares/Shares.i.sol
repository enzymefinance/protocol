pragma solidity ^0.5.13;

/// @notice Token representing ownership of the Fund
interface SharesInterface {
    function createFor(address who, uint amount) external;
    function destroyFor(address who, uint amount) external;
}

interface SharesFactoryInterface {
    function createInstance(address _hub) external returns (address);
}
