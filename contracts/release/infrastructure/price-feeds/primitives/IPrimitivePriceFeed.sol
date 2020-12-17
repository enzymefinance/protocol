// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IPrimitivePriceFeed Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interface for primitive price feeds
/// @dev IMPORTANT: all rates must be "normalized" to 18 decimals
interface IPrimitivePriceFeed {
    function getCanonicalRate(address, address) external view returns (uint256, bool);

    function getLiveRate(address, address) external view returns (uint256, bool);

    function isSupportedAsset(address) external view returns (bool);
}
