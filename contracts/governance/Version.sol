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

    event CoreCreated(address _fundAddress, uint indexed _id);

    // MODIFIERS

    // CONSTANT METHODS

    function numCreatedCores() constant returns (uint) { return cores.length; }
    function coreAt(uint index) constant returns (address) { return cores[index]; }

    // NON-CONSTANT METHODS
    function Version(address ofGovernance) { addrGovernance = ofGovernance; }

    function createCore(
        address ofUniverse,
        address ofRiskMgmt,
        address ofManagmentFee,
        address ofPerformanceFee
    )
        returns (address)
    {
        // Create new Core
        address createAddr = address(new Core(
            msg.sender,
            ofUniverse,
            ofRiskMgmt,
            ofManagmentFee,
            ofPerformanceFee
        ));

        // Change owner to msg.sender

        // Register Core
        cores.push(createAddr);
        CoreCreated(createAddr, cores.length);
        return createAddr;
    }

    // Dereference Core and trigger selfdestruct
    function annihilateCore() returns (address) {}
}
