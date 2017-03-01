pragma solidity ^0.4.8;

import "../dependencies/Owned.sol";

/// @title Meta Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Meta contract.
contract Meta is Owned {

    // FIELDS

    address[] public versions;
    mapping (address => bool) versionAvailabilities;

    // EVENTS

    event VersionUpdated(address indexed nextVersion, uint indexed id);

    // MODIFIERS

    // CONSTANT METHODS

    function numVersions() constant returns (uint) { return versions.length; }

    function versionAt(uint index) constant returns (address) { return versions[index]; }

    function availability(address ofVersion) constant returns (bool) { return versionAvailabilities[ofVersion]; }

    function updateVersion(address nextVersion) only_owner returns (bool) {
        // TODO: Assert stakeholder consensus
        versions.push(nextVersion);
        versionAvailabilities[nextVersion] = true;
        VersionUpdated(nextVersion, versions.length);
        return true;
    }

    // NON-CONSTANT METHODS

    function Meta() {}

}
