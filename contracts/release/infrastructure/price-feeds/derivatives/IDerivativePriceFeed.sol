// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IDerivativePriceFeed Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Simple interface for derivative price source oracle implementations
/// @dev IMPORTANT: all rates must be "normalized" to 18 decimals
interface IDerivativePriceFeed {
    function getRatesToUnderlyings(address) external returns (address[] memory, uint256[] memory);

    function isSupportedAsset(address) external view returns (bool);
}
