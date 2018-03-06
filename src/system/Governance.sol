pragma solidity ^0.4.19;

import "ds-group/group.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../version/VersionInterface.sol";

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

    // METHODS

    // CONSTRUCTOR

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

    // FALLBACK

    function() payable { }

    // PUBLIC VIEW METHODS

    /**
    @return {
        "ofVersion": "Address of the Version",
        "active": "Whether the Version in question is active",
        "timestamp": "When the Version in question was added to the list"
    }
    */
    function getVersionById(uint id) view returns (address ofVersion, bool active, uint timestamp) {
        return (
            versions[id].version,
            versions[id].active,
            versions[id].timestamp
        );
    }

    // INTERNAL METHODS

    /// @dev In later version, require authorities consensus
    /// @notice Add an approved version of Melon
    /// @param ofVersion Address of the version to add
    /// @return id integer ID of the version (list index)
    function addVersion(
        address ofVersion
    )
        pre_cond(msg.sender == address(this))
        returns (uint id)
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
        pre_cond(msg.sender == address(this))
        pre_cond(isActive(id))
    {
        VersionInterface Version = VersionInterface(versions[id].version);
        Version.shutDown();
        delete versions[id];
        VersionUpdated(id);
    }

    function getVersionsLength() public view returns (uint) {
        return versions.length;
    }

    function isActive(uint id) public view returns (bool active) {
        (, active, ) = getVersionById(id);
    }
}
