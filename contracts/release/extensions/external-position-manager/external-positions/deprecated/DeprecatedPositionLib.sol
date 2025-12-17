// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IExternalPositionProxy} from "../../../../../persistent/external-positions/IExternalPositionProxy.sol";
import {IVaultCore} from "../../../../../persistent/vault/interfaces/IVaultCore.sol";
import {IExternalPosition} from "../../IExternalPosition.sol";

/// @title DeprecatedPositionLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An External Position library contract for deprecated positions
contract DeprecatedPositionLib is IExternalPosition {
    error DeprecatedPositionLib__Deprecated();
    error DeprecatedPositionLib__OnlyVaultOwner();

    function callFromVaultOwner(address _target, bytes calldata _data, uint256 _value) external {
        address vault = IExternalPositionProxy(address(this)).getVaultProxy();
        address owner = IVaultCore(vault).getOwner();
        if (msg.sender != owner) revert DeprecatedPositionLib__OnlyVaultOwner();

        Address.functionCallWithValue({target: _target, data: _data, value: _value});
    }

    // REVERT ALL REQUIRED FUNCTIONS

    function init(bytes memory) external pure override {
        revert DeprecatedPositionLib__Deprecated();
    }

    function receiveCallFromVault(bytes memory) external pure override {
        revert DeprecatedPositionLib__Deprecated();
    }

    function getDebtAssets() external pure override returns (address[] memory, uint256[] memory) {
        revert DeprecatedPositionLib__Deprecated();
    }

    function getManagedAssets() external pure override returns (address[] memory, uint256[] memory) {
        revert DeprecatedPositionLib__Deprecated();
    }
}
