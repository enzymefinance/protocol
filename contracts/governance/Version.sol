pragma solidity ^0.4.8;

import "../Core.sol";
import "../dependencies/Owned.sol";

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is Owned {

    // FIELDS

    address public addrGovernance;
    address[] public cores;

    // EVENTS

    event CoreUpdate(uint id);

    // MODIFIERS

    // CONSTANT METHODS

    function numCreatedCores() constant returns (uint) { return cores.length; }
    function getCore(uint atIndex) constant returns (address) { return cores[atIndex]; }

    // NON-CONSTANT METHODS
    function Version(address ofGovernance) { addrGovernance = ofGovernance; }

    function createCore(
        string withName,
        address ofUniverse,
        address ofSubscribe,
        address ofRedeem,
        address ofRiskMgmt,
        address ofManagmentFee,
        address ofPerformanceFee
    )
        returns (address)
    {
        // Create new Core
        address createAddr = address(new Core(
            withName,
            msg.sender,
            ofUniverse,
            ofSubscribe,
            ofRedeem,
            ofRiskMgmt,
            ofManagmentFee,
            ofPerformanceFee
        ));

        // Change owner to msg.sender

        // Register Core
        cores.push(createAddr);
        uint id = cores.length;
        CoreUpdate(id);
        return createAddr;
    }

    // Dereference Core and trigger selfdestruct
    function annihilateCore(uint atIndex) returns (address) {
        // TODO also refund and selfdestruct core contract
        delete cores[atIndex];
    }
}
