// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../utils/IMigratableVault.sol";
import "./utils/ProxiableVaultLib.sol";
import "./utils/SharesTokenBase.sol";

/// @title VaultLibBaseCore Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a VaultLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered VaultLibBaseXXX that inherits the previous base. See VaultLibBase1.
abstract contract VaultLibBaseCore is IMigratableVault, ProxiableVaultLib, SharesTokenBase {
    event AccessorSet(address prevAccessor, address nextAccessor);

    event MigratorSet(address prevMigrator, address nextMigrator);

    event OwnerSet(address prevOwner, address nextOwner);

    event VaultLibSet(address prevVaultLib, address nextVaultLib);

    address internal accessor;
    address internal creator;
    address internal migrator;
    address internal owner;

    // EXTERNAL FUNCTIONS

    /// @notice Initializes the VaultProxy with core configuration
    /// @param _owner The address to set as the fund owner
    /// @param _accessor The address to set as the permissioned accessor of the VaultLib
    /// @param _fundName The name of the fund
    /// @dev Serves as a per-proxy pseudo-constructor
    function init(
        address _owner,
        address _accessor,
        string calldata _fundName
    ) external override {
        require(creator == address(0), "init: Proxy already initialized");
        creator = msg.sender;
        sharesName = _fundName;

        __setAccessor(_accessor);
        __setOwner(_owner);

        emit VaultLibSet(address(0), getVaultLib());
    }

    /// @notice Sets the permissioned accessor of the VaultLib
    /// @param _nextAccessor The address to set as the permissioned accessor of the VaultLib
    function setAccessor(address _nextAccessor) external override {
        require(msg.sender == creator, "setAccessor: Only callable by the contract creator");

        __setAccessor(_nextAccessor);
    }

    /// @notice Sets the VaultLib target for the VaultProxy
    /// @param _nextVaultLib The address to set as the VaultLib
    /// @dev This function is absolutely critical. __updateCodeAddress() validates that the
    /// target is a valid Proxiable contract instance.
    /// Does not block _nextVaultLib from being the same as the current VaultLib
    function setVaultLib(address _nextVaultLib) external override {
        require(msg.sender == creator, "setVaultLib: Only callable by the contract creator");

        address prevVaultLib = getVaultLib();

        __updateCodeAddress(_nextVaultLib);

        emit VaultLibSet(prevVaultLib, _nextVaultLib);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether an account is allowed to migrate the VaultProxy
    /// @param _who The account to check
    /// @return canMigrate_ True if the account is allowed to migrate the VaultProxy
    function canMigrate(address _who) public view virtual override returns (bool canMigrate_) {
        return _who == owner || _who == migrator;
    }

    /// @notice Gets the VaultLib target for the VaultProxy
    /// @return vaultLib_ The address of the VaultLib target
    function getVaultLib() public view returns (address vaultLib_) {
        assembly {
            // solium-disable-line
            vaultLib_ := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
        }
        return vaultLib_;
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to set the permissioned accessor of the VaultProxy.
    /// Does not prevent the prevAccessor from being the _nextAccessor.
    function __setAccessor(address _nextAccessor) internal {
        require(_nextAccessor != address(0), "__setAccessor: _nextAccessor cannot be empty");
        address prevAccessor = accessor;

        accessor = _nextAccessor;

        emit AccessorSet(prevAccessor, _nextAccessor);
    }

    /// @dev Helper to set the owner of the VaultProxy
    function __setOwner(address _nextOwner) internal {
        require(_nextOwner != address(0), "__setOwner: _nextOwner cannot be empty");
        address prevOwner = owner;
        require(_nextOwner != prevOwner, "__setOwner: _nextOwner is the current owner");

        owner = _nextOwner;

        emit OwnerSet(prevOwner, _nextOwner);
    }
}
