// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IChai Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Minimal interface for our interactions with the Chai contract
interface IChai is IERC20 {
    function exit(address, uint256) external;

    function join(address, uint256) external;
}
