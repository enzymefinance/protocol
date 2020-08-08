// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IChai Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Minimal interface for our interactions with the Chai contract
interface IChai {
    function exit(address, uint256) external;

    function join(address, uint256) external;
}
