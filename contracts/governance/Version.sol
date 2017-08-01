pragma solidity ^0.4.11;

import "../Vault.sol";
import "../VaultProtocol.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../dependencies/Logger.sol";

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
    }

    // FIELDS

    // Fields that are only changed in constructor
    address public MELON_ASSET; // Adresss of Melon asset contract
    address public GOVERNANCE; // Address of Melon protocol governance contract
    address public LOGGER;
    // Fields that can be changed by functions
    mapping (uint => VaultInfo) public vaults;
    uint public lastVaultId;

    // EVENTS

    event VaultUpdated(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isVaultOwner(uint id) internal returns (bool) {
        var (, owner, , , , ,) = getVault(id);
        return owner == msg.sender;
    }

    // CONSTANT METHODS

    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function getLastVaultId() constant returns (uint) { return lastVaultId; }
    function getVault(uint id) constant returns (address, address, string, string, uint, bool, uint) {
        var info = vaults[id];
        return (
            info.vault,
            info.owner,
            info.name,
            info.symbol,
            info.decimals,
            info.active,
            info.timestamp
        );
    }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastVaultId++; return lastVaultId;
    }

    // NON-CONSTANT METHODS

    function Version(
        address ofMelonAsset
    ) {
        GOVERNANCE = msg.sender; //TODO fix (not set as msg.sender by default!)
        MELON_ASSET = ofMelonAsset;

        LOGGER = new Logger()
    }

    function setupVault(
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofUniverse,
        address ofParticipation,
        address ofRiskMgmt,
        address ofRewards,
        address ofLogger
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
            MELON_ASSET,
            ofUniverse,
            ofParticipation,
            ofRiskMgmt,
            ofRewards,
            ofLogger
        ));
        info.owner = msg.sender;
        info.name = withName;
        info.symbol = withSymbol;
        info.decimals = withDecimals;
        info.active = true;
        info.timestamp = now;
        id = next_id();
        vaults[id] = info;
        LOGGER.addPermission(info.vault);
    }

    // Dereference Vault and trigger selfdestruct
    function decommissionVault(uint id)
        pre_cond(isVaultOwner(id))
    {
        // TODO also refund and selfdestruct vault contract
        delete vaults[id];
        VaultUpdated(id);
    }
}
