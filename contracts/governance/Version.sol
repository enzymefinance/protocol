pragma solidity ^0.4.11;

import "../Core.sol";
import "../CoreProtocol.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned {

    // TYPES

    struct CoreInfo {
        address core;
        address owner;
        string name;
        string symbol;
        uint decimals;
        bool active;
    }

    struct ModuleUsageCounter {
        uint ofUniverse;
        uint ofRiskMgmt;
        uint ofManagementFee;
        uint ofPerformanceFee;
    }

    // FIELDS

    address public addrGovernance;
    mapping (uint => CoreInfo) public cores;
    mapping (uint => ModuleUsageCounter) public usage;
    uint public lastCoreId;

    // EVENTS

    event CoreUpdate(uint id);

    // PRE, POST, INVARIANT CONDITIONS

    function isCoreOwner(uint atIndex) internal returns (bool) {
        var (, owner, , , ,) = getCore(atIndex);
        return owner == msg.sender;
    }

    // CONSTANT METHODS

    function getLastCoreId() constant returns (uint) { return lastCoreId; }
    function getCore(uint atIndex) constant returns (address, address, string, string, uint, bool) {
        var core = cores[atIndex];
        return (core.core, core.owner, core.name, core.symbol, core.decimals, core.active);
    }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastCoreId++; return lastCoreId;
    }

    // NON-CONSTANT METHODS

    function Version(address ofGovernance) { addrGovernance = ofGovernance; }

    function createCore(
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofUniverse,
        address ofSubscribe,
        address ofRedeem,
        address ofRiskMgmt,
        address ofManagmentFee,
        address ofPerformanceFee
    )
        returns (uint id)
    {
        // Create and register new Core
        CoreInfo memory info;
        info.core = address(new Core(
            msg.sender,
            withName,
            withSymbol,
            withDecimals,
            ofUniverse,
            ofSubscribe,
            ofRedeem,
            ofRiskMgmt,
            ofManagmentFee,
            ofPerformanceFee
        ));
        info.owner = msg.sender;
        info.name = withName;
        info.symbol = withSymbol;
        info.decimals = withDecimals;
        info.active = true;
        id = next_id();
        cores[id] = info;
        CoreUpdate(id);
    }

    // Dereference Core and trigger selfdestruct
    function annihilateCore(uint atIndex)
        pre_cond(isCoreOwner(atIndex))
    {
        // TODO also refund and selfdestruct core contract
        delete cores[atIndex];
        CoreUpdate(atIndex);
    }
}
