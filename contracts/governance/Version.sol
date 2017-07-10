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
        bytes32 ipfsHash;
        bytes32 swarmHash;
    }

    struct ModuleSelection {
        address ofUniverse;
        address ofRiskMgmt;
        address ofManagementFee;
        address ofPerformanceFee;
    }

    // FIELDS

    address public addrGovernance;
    mapping (uint => VaultInfo) public vaults;
    mapping (uint => ModuleSelection) public usage;
    uint public lastVaultId;

    // EVENTS

    event VaultAdded(
        address vault,
        address owner,
        string name,
        string symbol,
        uint decimals,
        bool active,
        uint id,
        address ofUniverse,
        address ofSubscribe,
        address ofRedeem,
        address ofRiskMgmt,
        address ofManagementFee,
        address ofPerformanceFee
    );
    event VaultUpdate(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isVaultOwner(uint atIndex) internal returns (bool) {
        var (, owner, , , ,) = getVault(atIndex);
        return owner == msg.sender;
    }

    // CONSTANT METHODS

    function getLastVaultId() constant returns (uint) { return lastVaultId; }
    function getVault(uint atIndex) constant returns (address, address, string, string, uint, bool) {
        var vault = vaults[atIndex];
        return (vault.vault, vault.owner, vault.name, vault.symbol, vault.decimals, vault.active);
    }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastVaultId++; return lastVaultId;
    }

    // NON-CONSTANT METHODS

    function Version(address ofGovernance) { addrGovernance = ofGovernance; }

    function createVault(
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofUniverse,
        address ofSubscribe,
        address ofRedeem,
        address ofRiskMgmt,
        address ofManagmentFee,
        address ofPerformanceFee
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
            ofUniverse,
            ofSubscribe,
            ofRedeem,
            ofRiskMgmt,
            ofManagmentFee,
            ofPerformanceFee
        ));
        info.owner = msg.sender;
        info.name = withName;
        info.symbol = withSymbol;
        info.decimals = withDecimals;
        info.active = true;
        id = next_id();
        vaults[id] = info;
        VaultAdded(
          info.vault,
          info.owner,
          info.name,
          info.symbol,
          info.decimals,
          info.active,
          id,
          ofUniverse,
          ofSubscribe,
          ofRedeem,
          ofRiskMgmt,
          ofManagmentFee,
          ofPerformanceFee
        );
    }

    // Dereference Vault and trigger selfdestruct
    function annihilateVault(uint atIndex)
        pre_cond(isVaultOwner(atIndex))
    {
        // TODO also refund and selfdestruct vault contract
        delete vaults[atIndex];
        VaultUpdate(atIndex);
    }
}
