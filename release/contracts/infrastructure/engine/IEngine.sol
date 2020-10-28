// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IEngine Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IEngine {
    function calcEthDueForGasUsed(uint256) external returns (uint256, bool);

    function getAmguPrice() external view returns (uint256);

    function payAmguInEther() external payable;

    function sellAndBurnMln(uint256) external;
}
