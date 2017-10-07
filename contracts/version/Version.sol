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
    string public VERSION_NUMBER; // SemVer of Melon protocol version
    address public MELON_ASSET; // Adresss of Melon asset contract
    address public GOVERNANCE; // Address of Melon protocol governance contract
    // Methods fields
    bool public isShutDown; // Governance feature, if yes than setupFund gets blocked and shutDownFund gets opened
    mapping (address => address) public managerToFunds; // Links manager address to fund addresseses created using this version
    address[] public listOfFunds; // A complete list of fund addresses created using this version

    // EVENTS

    event FundUpdated(uint id);

    // CONSTANT METHODS

    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function notShutDown() internal returns (bool) { return !isShutDown; }
    function getFundById(uint withId) constant returns (address) { return listOfFunds[withId]; }
    function getLastFundId() constant returns (uint) { return listOfFunds.length -1; }
    function getFundByManager(address ofManager) constant returns (address) { return managerToFunds[ofManager]; }

    // NON-CONSTANT METHODS

    function Version(
        string versionNumber,
        address ofGovernance,
        address ofMelonAsset
    ) {
        VERSION_NUMBER = versionNumber;
        GOVERNANCE = ofGovernance;
        MELON_ASSET = ofMelonAsset;
    }

    function shutDown() external pre_cond(msg.sender == GOVERNANCE) { isShutDown = true; }

    function setupFund(
        string withName,
        address ofReferenceAsset,
        uint ofManagementRewardRate,
        uint ofPerformanceRewardRate,
        address ofParticipation,
        address ofRiskMgmt,
        address ofSphere
    )
        pre_cond(notShutDown())
    {
        address fund = new Fund(
            msg.sender,
            withName,
            ofReferenceAsset,
            ofManagementRewardRate,
            ofPerformanceRewardRate,
            MELON_ASSET,
            ofParticipation,
            ofRiskMgmt,
            ofSphere
        );
        listOfFunds.push(fund);
        managerToFunds[msg.sender] = fund;
        FundUpdated(getLastFundId());
    }

    /// @dev Dereference Fund and trigger selfdestruct
    function shutDownFund(uint id)
        pre_cond(isOwner() || isShutDown)
    {
        FundInterface Fund = FundInterface(getFundById(id));
        Fund.shutDown();
        delete listOfFunds[id];
        FundUpdated(id);
    }
}
