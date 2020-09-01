// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IDerivativePriceFeed Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Simple interface for derivative price source oracle implementations
interface IDerivativePriceFeed {
    function getRatesToUnderlyings(address) external returns (address[] memory, uint256[] memory);

    function isSupportedAsset(address) external view returns (bool);
}
