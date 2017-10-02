pragma solidity ^0.4.11;

import '../Fund.sol';
import '../FundInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract Version is DBC, Owned {

    // TYPES

    enum Status {
        setup,
        funding,
        trading,
        payout
    }

    // FIELDS

    // Constructor fields
    address public MELON_ASSET; // Adresss of Melon asset contract
    address public GOVERNANCE; // Address of Melon protocol governance contract

    // Function fields
    mapping (address => address) public managers; // Links manager address to fundId list
    mapping (uint => address) public funds; // Links fundId to fundAddr
    uint public nextFundId;

    // EVENTS

    event FundAdded(address fundAddr, uint id, string name, uint256 atTime);
    event FundUpdated(uint id);

    // CONSTANT METHODS

    function getFundById(uint id) constant returns (address) { return funds[id]; }
    function fundForManager(address ofManager) constant returns (address) {
        return managers[ofManager];
    }
    function getMelonAsset() constant returns (address) { return MELON_ASSET; }
    function getNextFundId() constant returns (uint) { return nextFundId; }
    function getLastFundId() constant returns (uint) {
      require(nextFundId > 0);
      return nextFundId - 1;
    }

    /// @return list of all Funds address is invested in
    /// @return list of all numbers of Shares address holds in Fund
    /// @return list of all decimals of this Fund
    function getSubscriptionHistory(address ofAddress, uint startId)
        constant
        pre_cond(0 <= startId && startId < nextFundId)
        returns (address[1024], uint256[1024], uint256[1024])
    {
        address[1024] memory funds;
        uint[1024] memory holdings;
        uint[1024] memory decimals;
        for (uint256 i = 0; i < 1024; ++i) {
            if (startId + i >= nextFundId) break;
            FundInterface Fund = FundInterface(getFundById(i));
            holdings[i] = Fund.balanceOf(msg.sender);
            decimals[i] = Fund.getDecimals();
        }
        return (funds, holdings, decimals);
    }

    function getFunds(uint start)
        constant
        returns (address[1024] allFunds)
    {
        for(uint ii = 0; ii < 1024; ii++){
            if(start + ii >= nextFundId) break;
            allFunds[ii] = funds[ii];
        }
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
        FundInterface Fund = FundInterface(getFundById(id));
        Fund.shutDown();
        delete funds[id];
        FundUpdated(id);
    }

}
