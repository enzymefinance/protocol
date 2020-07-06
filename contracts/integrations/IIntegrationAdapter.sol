// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title Integration Adapter interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IIntegrationAdapter {
    function identifier() external pure returns (string memory);
    function parseAssetsForMethod(bytes4, bytes calldata)
        external
        view
        returns (address[] memory, uint256[] memory, address[] memory, uint256[] memory);
}
