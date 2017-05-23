pragma solidity ^0.4.11;

import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";

/// @title Governance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Governance contract.
contract Governance is DBC, Owned {

    // FIELDS

    address[] public versions;
    mapping (address => bool) versionAvailabilities;

    // EVENTS

    event VersionUpdated(address indexed nextVersion, uint indexed id);

    // MODIFIERS

    // CONSTANT METHODS

    function numVersions() constant returns (uint) { return versions.length; }
    function versionAt(uint index) constant returns (address) { return versions[index]; }
    function assetAvailability(address ofVersion) constant returns (bool) { return versionAvailabilities[ofVersion]; }

    // NON-CONSTANT METHODS

    function Governance() {}

    /// Pre: Only Owner
    /// Post: Updates Melon protocol version:
    function updateVersion(address nextVersion)
        pre_cond(isOwner())
    {
        // TODO: Assert stakeholder consensus
        versions.push(nextVersion);
        versionAvailabilities[nextVersion] = true;
        VersionUpdated(nextVersion, versions.length);
    }
}
