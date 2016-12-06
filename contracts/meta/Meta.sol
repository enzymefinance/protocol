pragma solidity ^0.4.4;

import "../dependencies/Owned.sol";

/// @title Meta Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Meta contract.
contract Meta is Owned {

    // FILEDS

    address[] public versions;
    mapping (address => bool) versionAvailabilities;


    // EVENTS

    event VersionUpdated(address indexed toVersion, uint indexed id);

    // MODIFIERS

    // CONSTANT METHODS

    function numVersions() constant returns (uint) { return versions.length; }

    function availability(address ofVersion) constant returns (bool) { return versionAvailabilities[ofVersion]; }

    /// Insert voting mechanism
    function updateVersion(address toVersion) only_owner returns (bool) {
        // Registrar Version
        versions.push(toVersion);
        versionAvailabilities[toVersion] = true;
        VersionUpdated(toVersion, versions.length);
        return true;
    }

    // NON-CONSTANT METHODS

    function Meta() {}

}
