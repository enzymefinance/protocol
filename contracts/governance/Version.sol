pragma solidity ^0.4.11;

import '../Vault.sol';
import '../VaultInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned {

    // EVENTS
    event VaultAdded(address vaultAddress, uint id, string name, uint256 atTime);

    // TYPES
    enum Status {
        setup,
        funding,
        trading,
        payout
    }

    // FIELDS
    // Constructor fields
    address public MELON_ASSET; // Adresss of Melon asset contract
    address public GOVERNANCE; // Address of Melon protocol governance contract
    // Function fields
    mapping (address => address) public managers; // Links manager address to vault id list
    mapping (uint => address) public vaults; // Links identifier to vault addresses
    uint public nextVaultId;

    // EVENTS
    event VaultUpdated(uint id);

    // CONSTANT METHODS

    function getVault(uint id) constant returns (address) { return vaults[id]; }
    function vaultForManager(address mgr) constant returns (address) {
        return managers[mgr];
    }
    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function getNextVaultId() constant returns (uint) { return nextVaultId; }
    function getLastVaultId() constant returns (uint) {
      require(nextVaultId > 0);
      return nextVaultId - 1;
    }

    // @returns list of all Vaults address is invested in
    // @returns list of all numbers of Shares address holds in Vault
    // @returns list of all decimals of this Vault
    function getSubscriptionHistory(address ofAddress, uint startId)
        constant
        pre_cond(0 <= startId && startId < nextVaultId)
        returns (address[1024], uint256[1024], uint256[1024])
    {
        address[1024] memory vaults;
        uint[1024] memory holdings;
        uint[1024] memory decimals;
        for (uint256 i = 0; i < 1024; ++i) {
            if (startId + i >= nextVaultId) break;
            VaultInterface Vault = VaultInterface(getVault(i));
            holdings[i] = Vault.balanceOf(msg.sender);
            decimals[i] = Vault.getDecimals();
        }
        return (vaults, holdings, decimals);
    }

    // NON-CONSTANT METHODS
    function Version(
        address ofMelonAsset
    ) {
        GOVERNANCE = msg.sender; //TODO fix (not set as msg.sender by default!)
        MELON_ASSET = ofMelonAsset;
    }

    function setupVault(
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofParticipation,
        address ofRiskMgmt,
        address ofSphere
    )
    {
        address vault = new Vault(
            msg.sender,
            withName,
            withSymbol,
            withDecimals,
            MELON_ASSET,
            ofParticipation,
            ofRiskMgmt,
            ofSphere
        );
        vaults[nextVaultId] = vault;
        managers[msg.sender] = vault;
        VaultAdded(vault, nextVaultId, withName, now);
        nextVaultId++;
    }

    // Dereference Vault and trigger selfdestruct
    function shutDownVault(uint id)
        pre_cond(isOwner())
    {
        VaultInterface Vault = VaultInterface(getVault(id));
        Vault.shutDown();
        delete vaults[id];
        VaultUpdated(id);
    }

   	function getVaults(uint start)
        constant
        returns (address[1024] allVaults)
    {
        for(uint ii = 0; ii < 1024; ii++){
            if(start + ii >= nextVaultId) break;
            allVaults[ii] = vaults[ii];
        }
    }
}
