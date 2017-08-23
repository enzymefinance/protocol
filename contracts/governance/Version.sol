pragma solidity ^0.4.11;

import '../Vault.sol';
import '../VaultInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import '../dependencies/Logger.sol';

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned {

    // TYPES
    enum Status {
        setup,
        funding,
        trading,
        payout
    }

    // FIELDS
    // Fields that are only changed in constructor
    address public MELON_ASSET; // Adresss of Melon asset contract
    address public ASSET_REGISTRAR; // Address of Asset Registrar contract
    address public GOVERNANCE; // Address of Melon protocol governance contract
    address public LOGGER;
    Logger logger;
    // Fields that can be changed by functions
    mapping (address => uint[]) public managers; // Links manager address to vault id list
    mapping (uint => address) public vaults; // Links identifier to vault addresses
    uint public lastVaultId;

    // EVENTS

    event VaultUpdated(uint id);

    // CONSTANT METHODS

    function getVault(uint id) constant returns (address) { return vaults[id]; }
    function hasVault(address mgr) constant returns (bool) {return managers[id].length > 0}
    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function getLastVaultId() constant returns (uint) { return lastVaultId; }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastVaultId++; return lastVaultId;
    }

    // NON-CONSTANT METHODS
    function Version(
        address ofMelonAsset,
        address ofAssetRegistrar,
        address ofLogger
    ) {
        GOVERNANCE = msg.sender; //TODO fix (not set as msg.sender by default!)
        MELON_ASSET = ofMelonAsset;
        ASSET_REGISTRAR = ofAssetRegistrar;
        LOGGER = ofLogger;
        logger = Logger(LOGGER);
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
        address vault = address(new Vault(
            msg.sender,
            withName,
            withSymbol,
            withDecimals,
            ASSET_REGISTRAR,
            MELON_ASSET,
            ofUniverse,
            ofParticipation,
            ofRiskMgmt,
            ofRewards,
            LOGGER
        ));
        id = next_id();
        vaults[id] = vault;
        uint[] managedIds = managers[msg.sender];
        managers[msg.sender] = managedVaults.push(id);
        logger.addPermission(vault);
    }

    // Dereference Vault and trigger selfdestruct
    function decommissionVault(uint id)
        pre_cond(isOwner())
    {
        // TODO also refund and selfdestruct vault contract
        delete vaults[id];
        VaultUpdated(id);
    }

   	function getVaults(uint start)
        constant
        returns (address[1024] allVaults)
    {
        for(uint ii = 0; ii < 1024; ii++){
            if(start + ii > lastVaultId) break;
            allVaults[ii] = vaults[ii];
        }
    }
}
