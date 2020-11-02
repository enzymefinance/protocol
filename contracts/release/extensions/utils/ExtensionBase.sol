// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../IExtension.sol";

/// @title ExtensionBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Base class for an Extension
abstract contract ExtensionBase is IExtension {
    mapping(address => address) internal comptrollerProxyToVaultProxy;

    /// @notice Allows Extension to run logic during fund activation
    /// @dev Unimplemented by default, may be overrode.
    function activateForFund(bool) external virtual override {
        // UNIMPLEMENTED
    }

    /// @notice Allows Extension to run logic during fund deactivation (destruct)
    /// @dev Unimplemented by default, may be overrode.
    function deactivateForFund() external virtual override {
        // UNIMPLEMENTED
    }

    /// @notice Receives calls from ComptrollerLib.callOnExtension()
    /// and dispatches the appropriate action
    /// @dev Unimplemented by default, may be overrode.
    function receiveCallFromComptroller(
        address,
        uint256,
        bytes calldata
    ) external virtual override {
        revert("receiveCallFromComptroller: Unimplemented for Extension");
    }

    /// @notice Allows Extension to run logic during fund configuration
    /// @dev Unimplemented by default, may be overrode.
    function setConfigForFund(bytes calldata) external virtual override {
        // UNIMPLEMENTED
    }

    /// @dev Helper to validate a ComptrollerProxy-VaultProxy relation, which we store for both
    /// gas savings and to guarantee a spoofed ComptrollerProxy does not change getVaultProxy().
    /// Will revert without reason if the expected interfaces do not exist.
    function __setValidatedVaultProxy(address _comptrollerProxy)
        internal
        returns (address vaultProxy_)
    {
        require(
            comptrollerProxyToVaultProxy[_comptrollerProxy] == address(0),
            "__setValidatedVaultProxy: Already set"
        );

        vaultProxy_ = IComptroller(_comptrollerProxy).getVaultProxy();
        require(vaultProxy_ != address(0), "__setValidatedVaultProxy: Missing vaultProxy");

        require(
            _comptrollerProxy == IVault(vaultProxy_).getAccessor(),
            "__setValidatedVaultProxy: Not the VaultProxy accessor"
        );

        comptrollerProxyToVaultProxy[_comptrollerProxy] = vaultProxy_;

        return vaultProxy_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the verified VaultProxy for a given ComptrollerProxy
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return vaultProxy_ The VaultProxy of the fund
    function getVaultProxyForFund(address _comptrollerProxy)
        public
        view
        returns (address vaultProxy_)
    {
        return comptrollerProxyToVaultProxy[_comptrollerProxy];
    }
}
