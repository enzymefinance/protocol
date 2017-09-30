pragma solidity ^0.4.11;

import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';

/// @title Governance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Work in process: Intended to be a system contract w/in Melon chain
contract Governance is DBC, Owned {

    // TYPES

    struct Version {
        address version;
        bool active;
        uint timestamp;
    }

    // FIELDS

    // Constructor fields
    address public MELON_ASSET; // Adresss of Melon asset contract
    // Methods fields
    Version[] public versions;

    // EVENTS

    event VersionUpdated(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isActive(uint id) internal returns (bool active) {
        (, active, ) = getVersion(id);
    }

    // MODIFIERS

    // CONSTANT METHODS

    function getLastVersionId() constant returns (uint) { return versions.length -1; }
    function getVersion(uint id) constant returns (address, bool, uint) {
        return (
            versions[id].version,
            versions[id].active,
            versions[id].timestamp
        );
    }

    // NON-CONSTANT METHODS

    /// @notice Propose new versions of Melon
    function proposeVersion(address ofVersion)
        // In later version
        //  require Only authorities
    {}

    /// @notice Add an approved version of Melon
    function addVersion(
        address ofVersion
    )
        pre_cond(isOwner())
        // In later version
        //  require Authorities consensus
        returns (uint id)
    {
        Version memory info;
        info.version = ofVersion;
        info.active = true;
        info.timestamp = now;
        versions.push(info);
        VersionUpdated(getLastVersionId());
    }

    /// @notice Remove an decommissioned version of Melon
    function decommissionVersion(uint id)
        pre_cond(isOwner())
        pre_cond(isActive(id))
        // In later version
        //  require Authorities consensus
    {}
}
