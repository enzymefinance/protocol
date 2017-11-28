pragma solidity ^0.4.17;

import 'ds-group/group.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import '../version/VersionInterface.sol';

/// @title Governance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Defines a set of authorities who can propose new versions or shutdown old versions
contract Governance is DBC, Owned, DSGroup {

    // TYPES

    struct Version {
        address version;
        bool active;
        uint timestamp;
    }

    // FIELDS

    // Constructor fields
    address public MELON_ASSET; // Adresss of Melon asset contract
    address[] public authorities; // Addresses of all authorities
    // Methods fields
    Version[] public versions;
    mapping (address => uint) public versionToProposalIds; // Links version addresses to proposal ids created through DSGroup
    mapping (uint => uint) public versionIdToShutdownIds; // Links version ids to shutdown proposal ids created through DSGroup

    // EVENTS

    event VersionUpdated(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isActive(uint id) internal returns (bool active) {
        (, active, ) = getVersionById(id);
    }

    // MODIFIERS

    // CONSTANT METHODS

    function getVersionById(uint id) constant returns (address, bool, uint) {
        return (
            versions[id].version,
            versions[id].active,
            versions[id].timestamp
        );
    }

    // INTERNAL METHODS

    /// @notice Add an approved version of Melon
    /// @param ofVersion Address of the version to add
    function addVersion(
        address ofVersion
    )
        // In later version
        //  require Authorities consensus
        internal returns (uint id)
    {
        Version memory info;
        info.version = ofVersion;
        info.active = true;
        info.timestamp = now;
        versions.push(info);
        VersionUpdated(versions.length - 1);
    }

    /// @notice Remove and shut down version of Melon
    /// @param id Id of the version to shutdown
    function shutDownVersion(uint id)
        pre_cond(isActive(id)) internal
    {
        VersionInterface Version = VersionInterface(versions[id].version);
        Version.shutDown();
        delete versions[id];
        VersionUpdated(id);
    }

    // NON-CONSTANT METHODS

    /// @param ofAuthorities Addresses of authorities
    /// @param ofQuorum Minimum number of signatures required for proposal to pass by
    /// @param ofWindow Time limit for proposal validity
    function Governance(
        address[] ofAuthorities,
        uint ofQuorum,
        uint ofWindow
    )
        DSGroup(ofAuthorities, ofQuorum, ofWindow)
    {}

    /// @notice Propose new versions of Melon
    /// @param ofVersion Address of version contract to be proposed
    function proposeVersion(address ofVersion) {
        versionToProposalIds[ofVersion] = propose(address(this), new bytes(0), 0);
    }

    /// @notice Approve new versions of Melon
    /// @param ofVersion Address of version contract to be approved
    function approveVersion(address ofVersion) {
        confirm(versionToProposalIds[ofVersion]);
    }

    /// @notice Trigger new versions of Melon
    /// @param ofVersion Address of version contract to be triggered
    function triggerVersion(address ofVersion) {
        trigger(versionToProposalIds[ofVersion]);
        addVersion(ofVersion);
    }

    /// @notice Propose shutdown of Melon version
    /// @param ofVersionId Version id to be proposed for shutdown
    function proposeShutdown(uint ofVersionId) {
        versionIdToShutdownIds[ofVersionId] = propose(address(this), new bytes(0), 0);
    }

    /// @notice Approve shutdown of Melon version
    /// @param ofVersionId Version id to be approved for shutdown
    function approveShutdown(uint ofVersionId) {
        confirm(versionIdToShutdownIds[ofVersionId]);
    }

    /// @notice Trigger shutdown of Melon version
    /// @param ofVersionId Version id to be triggered for shutdown
    function triggerShutdown(uint ofVersionId) {
        trigger(versionIdToShutdownIds[ofVersionId]);
        shutDownVersion(ofVersionId);
    }

    function() payable { }
}
