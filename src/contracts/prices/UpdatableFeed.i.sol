pragma solidity ^0.4.21;

/// @notice Updates values stored internally
interface UpdatableFeedInterface {
    event PriceUpdated(bytes32 hash);
    function update(address[] _assets, uint[] _prices) external;
    function getLastUpdateId() public view returns (uint);
}
