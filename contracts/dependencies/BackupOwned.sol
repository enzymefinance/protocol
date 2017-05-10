pragma solidity ^0.4.11;

import "./Assertive.sol";

/// @title Backup Owned Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Specifies an Owner as well as a secondary or backup Owner which can change owner
contract BackupOwned is Assertive {

    // FIELDS

    // Fields that are only changed in constructor
    address public owner;
    address public backupOwner;

    // MODIFIERS

    modifier only_owner {
        assert(msg.sender == owner);
        _;
    }

    modifier only_backup_owner {
        assert(msg.sender == backupOwner);
        _;
    }

    modifier address_not_null(address addr) {
        assert(addr != 0);
        _;
    }

    // NON-CONSTANT METHODS

    function BackupOwned(address ofBackupOwner)
    {
        owner = msg.sender;
        backupOwner = ofBackupOwner;
    }

    /// Pre: Only Backup Owner; Non-null new Backup Owner
    /// Post: Swaps backup Owner to Owner and new backup Owner to backup Owner
    function useBackup(address ofNewBackupOwner)
        only_backup_owner
        address_not_null(ofNewBackupOwner)
    {
        owner = msg.sender;
        backupOwner = ofNewBackupOwner;
    }

    /// Pre: Only Owner; Non-null new Backup Owner
    /// Post: New backup Owner
    function setNewBackup(address ofNewBackupOwner)
        only_owner
        address_not_null(ofNewBackupOwner)
    {
        backupOwner = ofNewBackupOwner;
    }

}
