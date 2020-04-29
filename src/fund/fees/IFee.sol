pragma solidity 0.6.4;

/// @title Fee Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFee {
    function feeAmount() external returns (uint256);
    function identifier() external view returns (uint256);
    function initializeForUser(uint256, uint256, address) external;
    function updateState() external;
}
