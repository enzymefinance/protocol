// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title ISynthetixAddressResolver Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface ISynthetixAddressResolver {
    function requireAndGetAddress(bytes32, string calldata) external view returns (address);
}
