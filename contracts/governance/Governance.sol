pragma solidity ^0.4.11;

import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";

/// @title Governance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Governance contract.
contract Governance is DBC, Owned {

    // TYPES

    struct VersionInfo {
        address version;
        bool active;
        uint timestamp;
    }

    // FIELDS

    // Fields that are only changed in constructor
    address public MELON_ASSET; // Adresss of Melon asset contract
    // Fields that can be changed by functions
    mapping (uint => VersionInfo) public versions;
    uint public lastVersionId;

    // EVENTS

    event VersionUpdated(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isActive(uint id) internal returns (bool active) {
        (, active, ) = getVersion(id);
    }

    // MODIFIERS

    // CONSTANT METHODS

    function getVersion(uint id) constant returns (address, bool, uint) {
        var version = versions[id];
        return (
            version.version,
            version.active,
            version.timestamp
        );
    }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastVersionId++; return lastVersionId;
    }

    // NON-CONSTANT METHODS

    function Governance(address ofMelonAsset) {
        MELON_ASSET = ofMelonAsset;
    }

    /// Pre:
    /// Post: Updates Melon protocol version
    function proposeVersion(
        address ofVersion
    ) {
        // TODO: Implement; Can be multisig stlye proposal and confirmation
    }

    /// Pre: Only Owner
    /// Post: Updates Melon protocol version:
    function addVersion(
        address ofVersion
    )
        // TODO: Assert Board Members consensus
        pre_cond(isOwner())
        returns (uint id)
    {
        VersionInfo memory info;
        info.version = ofVersion;
        info.active = true;
        info.timestamp = now;
        id = next_id();
        versions[id] = info;
        VersionUpdated(id);
    }

    function decommissionVersion(uint id)
        // TODO: Assert Board Members consensus
        pre_cond(isOwner())
        pre_cond(isActive(id))
    {
        // TODO decommissionVaults
    }
}
