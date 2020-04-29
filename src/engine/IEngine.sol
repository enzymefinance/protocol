pragma solidity 0.6.4;

/// @title Engine Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IEngine {
    function getAmguPrice() external view returns (uint256);
    function payAmguInEther() external payable;
    function sellAndBurnMln(uint256) external;
}
