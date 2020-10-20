// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/Proxiable.sol";
import "./IProxiableVault.sol";
import "./StandardERC20.sol";

/// @title VaultLibBaseCore Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A persistent contract containing all required storage variables,
/// the constructor function, and setters used in deployment.
/// @dev DO NOT EDIT CONTRACT.
/// All functions in this file should remain as-is in order to guarantee upgradeability.
/// If we need a new base with additional storage vars, inherit this contract.
abstract contract VaultLibBaseCore is StandardERC20, IProxiableVault, Proxiable {
    // TODO: Need to use a LibraryLock (check initialized) so that lib can only be delegatecalled?

    event AccessorSet(address prevAccessor, address nextAccessor);
    event MigratorSet(address prevMigrator, address nextMigrator);
    event OwnerSet(address prevOwner, address nextOwner);
    event VaultLibSet(address prevVaultLib, address nextVaultLib);

    bool internal initialized = false;

    address internal owner;
    address internal creator;
    address internal accessor;
    address internal migrator;

    modifier onlyCreator() {
        require(msg.sender == creator, "Only the contract creator can make this call");
        _;
    }

    // EXTERNAL FUNCTIONS

    function init(
        address _owner,
        address _accessor,
        string calldata _fundName
    ) external override {
        require(!initialized, "init: Proxy already initialized");

        nameInternal = _fundName;
        symbolInternal = "MLNF";
        decimalsInternal = 18;

        creator = msg.sender;
        __setAccessor(_accessor);
        __setOwner(_owner);

        initialized = true;

        emit VaultLibSet(address(0), getVaultLib());
    }

    function setAccessor(address _nextAccessor) external override onlyCreator {
        __setAccessor(_nextAccessor);
    }

    /// @dev This is absolutely critical. TODO: add more notes
    function setVaultLib(address _nextVaultLib) external override onlyCreator {
        address prevVaultLib = getVaultLib();
        if (_nextVaultLib != prevVaultLib) {
            __updateCodeAddress(_nextVaultLib);
            emit VaultLibSet(prevVaultLib, _nextVaultLib);
        }
    }

    // PUBLIC FUNCTIONS

    function canMigrate(address _who) public view virtual override returns (bool) {
        return _who == owner || _who == migrator;
    }

    // TODO: test this function
    function getVaultLib() public view returns (address) {
        address vaultLib;
        assembly {
            // solium-disable-line
            vaultLib := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
        }
        return vaultLib;
    }

    // INTERNAL FUNCTIONS

    /// @dev Don't prevent the prevAccessor from being the _nextAccessor, in case releases use the
    /// same accessor at some point.
    function __setAccessor(address _nextAccessor) internal {
        require(_nextAccessor != address(0), "__setAccessor: _nextAccessor cannot be empty");
        address prevAccessor = accessor;
        if (prevAccessor != _nextAccessor) {
            accessor = _nextAccessor;

            emit AccessorSet(prevAccessor, _nextAccessor);
        }
    }

    function __setOwner(address _nextOwner) internal {
        require(_nextOwner != address(0), "__setOwner: _nextOwner cannot be empty");
        address prevOwner = owner;
        require(_nextOwner != prevOwner, "__setOwner: _nextOwner is the current owner");

        owner = _nextOwner;

        emit OwnerSet(prevOwner, _nextOwner);
    }
}
