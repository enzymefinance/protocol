pragma solidity ^0.4.11;

import "./DBC.sol";
import "./Owned.sol";


/// @title Backup Owned Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Specifies an Owner as well as a secondary or backup Owner which can change owner
contract BackupOwned is DBC, Owned {

    // FIELDS

    // Fields that are only changed in constructor
    address public backupOwner;

    // DBC INTERNALS

    function isBackupOwner() internal returns (bool) { return msg.sender == backupOwner; }
    function backupOwnerIs(address x) internal returns (bool) { return backupOwner == x; }
    function isNotNullAddress(address x) internal returns (bool) { return x != 0; }

    // NON-CONSTANT METHODS

    function BackupOwned(address ofBackupOwner)
        Owned()
    {
        backupOwner = ofBackupOwner;
    }

    /// Pre: Only Backup Owner; Non-null new Backup Owner
    /// Post: Swaps backup Owner to Owner and new backup Owner to backup Owner
    function useBackup(address ofNewBackupOwner)
        precond(isBackupOwner())
        precond(isNotNullAddress(ofNewBackupOwner))
        postcond(isOwner())
        postcond(backupOwnerIs(ofNewBackupOwner))
    {
        owner = msg.sender;
        backupOwner = ofNewBackupOwner;
    }

    /// Pre: Only Owner; Non-null new Backup Owner
    /// Post: New backup Owner
    function setNewBackup(address ofNewBackupOwner)
        precond(isOwner())
        precond(isNotNullAddress(ofNewBackupOwner))
        postcond(backupOwnerIs(ofNewBackupOwner))
    {
        backupOwner = ofNewBackupOwner;
    }

}
