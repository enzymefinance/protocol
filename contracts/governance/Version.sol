pragma solidity ^0.4.11;

import "../Vault.sol";
import "../VaultProtocol.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned {

    // TYPES

    struct VaultInfo {
        address vault;
        address owner;
        string name;
        string symbol;
        uint decimals;
        bool active;
        uint timestamp;
        bytes32 ipfsHash;
        bytes32 swarmHash;
    }

    // FIELDS

    // Fields that are only changed in constructor
    address public melonAsset; // Adresss of Melon asset contract
    address public governance; // Address of Melon protocol governance contract
    // Fields that can be changed by functions
    mapping (uint => VaultInfo) public vaults;
    uint public lastVaultId;

    // EVENTS

    event VaultUpdate(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isVaultOwner(uint atIndex) internal returns (bool) {
        var (, owner, , , , ,) = getVault(atIndex);
        return owner == msg.sender;
    }

    // CONSTANT METHODS

    function getMelonAsset() constant returns (address) { return melonAsset; }
    function getLastVaultId() constant returns (uint) { return lastVaultId; }
    function getVault(uint atIndex) constant returns (address, address, string, string, uint, bool, uint) {
        var vault = vaults[atIndex];
        return (vault.vault, vault.owner, vault.name, vault.symbol, vault.decimals, vault.active, vault.timestamp);
    }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastVaultId++; return lastVaultId;
    }

    // NON-CONSTANT METHODS

    function Version(
        address ofMelonAsset,
        address ofGovernance
    ) {
        melonAsset = ofMelonAsset;
        governance = ofGovernance;
    }

    function setupVault(
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofUniverse,
        address ofParticipation,
        address ofRiskMgmt,
        address ofRewards
    )
        returns (uint id)
    {
        // Create and register new Vault
        VaultInfo memory info;
        info.vault = address(new Vault(
            msg.sender,
            withName,
            withSymbol,
            withDecimals,
            melonAsset,
            ofUniverse,
            ofParticipation,
            ofRiskMgmt,
            ofRewards
        ));
        info.owner = msg.sender;
        info.name = withName;
        info.symbol = withSymbol;
        info.decimals = withDecimals;
        info.active = true;
        info.timestamp = now;
        id = next_id();
        vaults[id] = info;
    }

    // Dereference Vault and trigger selfdestruct
    function decommissionVault(uint atIndex)
        pre_cond(isVaultOwner(atIndex))
    {
        // TODO also refund and selfdestruct vault contract
        delete vaults[atIndex];
        VaultUpdate(atIndex);
    }
}
