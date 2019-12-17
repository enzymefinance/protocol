pragma solidity ^0.5.13;

/// @notice Updates values stored internally
interface IUpdatableFeed {
    function update(address[] calldata _assets, uint[] calldata _prices) external;
    function getLastUpdateId() external view returns (uint);
}
