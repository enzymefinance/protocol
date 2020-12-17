// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IIntegrationManager interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interface for the IntegrationManager
interface IIntegrationManager {
    enum SpendAssetsHandleType {None, Approve, Transfer, Remove}
}
