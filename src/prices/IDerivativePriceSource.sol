pragma solidity 0.6.8;

/// @title IDerivativePriceSource Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Simple interface for derivative price source oracle implementations
interface IDerivativePriceSource {
    function getPrice(address _derivative) external view returns (address, uint256);
    function lastUpdated() external view returns (uint256);
    function update() external;
}
