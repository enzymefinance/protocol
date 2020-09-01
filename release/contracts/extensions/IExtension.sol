// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IExtension Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IExtension {
    function setFundConfig(bytes calldata) external;
}
