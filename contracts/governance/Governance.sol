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

    event VersionUpdated(address indexed ofVersion, uint indexed id);

    // MODIFIERS

    // CONSTANT METHODS

    function numVersions() constant returns (uint) { return versions.length; }
    function versionAt(uint index) constant returns (address) { return versions[index]; }
    function assetAvailability(address ofVersion) constant returns (bool) { return versionAvailabilities[ofVersion]; }

    // NON-CONSTANT METHODS

    function Governance() {}

    /// Pre: Only Owner
    /// Post: Updates Melon protocol version:
    function addVersion(address ofVersion)
        // TODO: Assert Board Members consensus
        pre_cond(isOwner())
    {
        versions.push(ofVersion);
        versionAvailabilities[ofVersion] = true;
        VersionUpdated(ofVersion, versions.length);
    }

    function decommissionVersion(address ofVersion)
        // TODO: Assert Board Members consensus
        pre_cond(isOwner())
    {
        // TODO decommissionVaults
    }
}
