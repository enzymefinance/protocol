pragma solidity ^0.4.11;

import '../Fund.sol';
import '../FundInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import './VersionInterface.sol';

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned {

    // FIELDS

    // Constructor fields
    address public VERSION_NUMBER = "0.4.0"; //
    address public MELON_ASSET; // Adresss of Melon asset contract
    address public GOVERNANCE; // Address of Melon protocol governance contract

    // Methods fields
    mapping (address => address) public managers; // Links manager address to fundId list
    mapping (uint => address) public funds; // Links fundId to fundAddr
    uint public nextFundId;

    // EVENTS

    event FundAdded(address fundAddr, uint id, string name, uint256 atTime);
    event FundUpdated(uint id);

    // CONSTANT METHODS

    function getFund(uint id) constant returns (address) { return funds[id]; }
    function fundForManager(address ofManager) constant returns (address) {
        return managers[ofManager];
    }
    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function getNextFundId() constant returns (uint) { return nextFundId; }
    function getLastFundId() constant returns (uint) {
      require(nextFundId > 0);
      return nextFundId - 1;
    }

    // NON-CONSTANT METHODS

    function Version(
        address ofMelonAsset
    ) {
        GOVERNANCE = msg.sender; //TODO fix (not set as msg.sender by default!)
        MELON_ASSET = ofMelonAsset;
    }

    function setupFund(
        string withName,
        string withSymbol,
        uint withDecimals,
        uint ofManagementRewardRate,
        uint ofPerformanceRewardRate,
        address ofParticipation,
        address ofRiskMgmt,
        address ofSphere
    ) {
        address fundAddr = new Fund(
            msg.sender,
            withName,
            withSymbol,
            withDecimals,
            ofManagementRewardRate,
            ofPerformanceRewardRate,
            MELON_ASSET,
            ofParticipation,
            ofRiskMgmt,
            ofSphere
        );
        funds[nextFundId] = fundAddr;
        managers[msg.sender] = fundAddr;
        FundAdded(fundAddr, nextFundId, withName, now);
        nextFundId++;
    }

    /// @dev Dereference Fund and trigger selfdestruct
    function shutDownFund(uint id)
        pre_cond(isOwner())
    {
        FundInterface Fund = FundInterface(getFund(id));
        Fund.shutDown();
        delete funds[id];
        FundUpdated(id);
    }
}
