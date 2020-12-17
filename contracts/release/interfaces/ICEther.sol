// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ICEther Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Minimal interface for interactions with Compound Ether
interface ICEther {
    function mint() external payable;
}
