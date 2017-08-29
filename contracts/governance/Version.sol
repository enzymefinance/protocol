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
    address public GOVERNANCE; // Address of Melon protocol governance contract
    address public LOGGER;
    Logger logger;
    // Fields that can be changed by functions
    mapping (address => uint[]) public managers; // Links manager address to vault id list
    mapping (uint => address) public vaults; // Links identifier to vault addresses
    uint public nextVaultId;

    // EVENTS
    event VaultUpdated(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isInHistory(uint id) constant returns (bool) { return 0 <= id && id < nextVaultId; }

    // CONSTANT METHODS
<<<<<<< HEAD

=======
    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function getLastVaultId() constant returns (uint) { return lastVaultId; }
>>>>>>> origin/develop
    function getVault(uint id) constant returns (address) { return vaults[id]; }
    function hasVault(address mgr) constant returns (bool) {
      return managers[mgr].length > 0;
    }
    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function getNextVaultId() constant returns (uint) { return nextVaultId; }
    function getLastVaultId() constant returns (uint) {
      require(nextVaultId > 0);
      return nextVaultId - 1;
    }

<<<<<<< HEAD
    // @returns list of all Vaults address is invested in
    // @returns list of all numbers of Shares address holds in Vault
    // @returns list of all decimals of this Vault
    function getSubscriptionHistory(address ofAddress, uint withStartId)
        constant
        pre_cond(isInHistory(withStartId))
        returns (address[1024], uint256[1024], uint256[1024])
    {
        address[1024] memory vaults;
        uint[1024] memory holdings;
        uint[1024] memory decimals;
        for (uint256 i = 0; i < 1024; ++i) {
            if (withStartId + i >= nextVaultId) break;
            vaults[i] = getVault(i);
            VaultInterface Vault = VaultInterface(vaults[i]);
            holdings[i] = Vault.balanceOf(msg.sender);
            decimals[i] = Vault.getDecimals();
        }
        return (vaults, holdings, decimals);
=======
    // NON-CONSTANT INTERNAL METHODS
    function next_id() internal returns (uint) {
        lastVaultId++; return lastVaultId;
>>>>>>> origin/develop
    }

    // NON-CONSTANT METHODS
    function Version(
        address ofMelonAsset,
        address ofLogger
    ) {
        GOVERNANCE = msg.sender; //TODO fix (not set as msg.sender by default!)
        MELON_ASSET = ofMelonAsset;
        LOGGER = ofLogger;
        logger = Logger(LOGGER);
    }

    function setupVault(
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofParticipation,
        address ofRiskMgmt,
        address ofSphere
    )
        returns (uint id)
    {
        address vault = new Vault(
            msg.sender,
            withName,
            withSymbol,
            withDecimals,
            MELON_ASSET,
            ofParticipation,
            ofRiskMgmt,
            ofSphere,
            LOGGER
      );
        vaults[nextVaultId] = vault;
        managers[msg.sender].push(nextVaultId);
        nextVaultId++;
    }

    // Dereference Vault and trigger selfdestruct
    function decommissionVault(uint id)
        pre_cond(isOwner())
    {
        // TODO also refund and selfdestruct vault contract
        delete vaults[id];
        VaultUpdated(id);
    }

<<<<<<< HEAD
   	function getVaults(uint start)
=======
    function getVaults(uint start)
>>>>>>> origin/develop
        constant
        returns (address[1024] allVaults)
    {
        for(uint ii = 0; ii < 1024; ii++){
<<<<<<< HEAD
            if(start + ii >= nextVaultId) break;
=======
            if(start + ii > lastVaultId) break;
>>>>>>> origin/develop
            allVaults[ii] = vaults[ii];
        }
    }
}
