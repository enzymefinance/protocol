// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IDerivativePriceSource Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Simple interface for derivative price source oracle implementations
interface IDerivativePriceSource {
    function getRatesToUnderlyings(address _derivative)
        external
        returns (address[] memory underlyings, uint256[] memory rates);
}
