// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IIntegrationManager interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for the IntegrationManager
interface IIntegrationManager {
    enum SpendAssetsHandleType {None, Approve, Transfer, Remove}
}
