pragma solidity ^0.4.11;

import './dependencies/ERC20.sol';

/// @title Fund Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple vault
contract FundHistory {

    // TYPES

    enum RequestStatus { open, cancelled, executed }
    enum RequestType { subscribe, redeem }

    struct Request {
        address owner;
        RequestStatus status;
        RequestType requestType;
        uint numShares;
        uint offeredOrRequestedValue;
        uint incentive;
        uint lastFeedUpdateId;
        uint lastFeedUpdateTime;
        uint timestamp;
    }

    // EVENTS

    event LogRequest(
        address owner,
        RequestStatus status,
        RequestType requestType,
        uint numShares,
        uint offeredOrRequestedValue,
        uint incentive,
        uint lastFeedUpdateId,
        uint lastFeedUpdateTime,
        uint timestamp
    );

    event LogMakeOrder(
        address EXCHANGE,
        address sellAsset, // Asset (as registred in Asset registrar) to be sold
        address buyAsset, // Asset (as registred in Asset registrar) to be bought
        uint sellQuantity, // Quantity of sellAsset to be sold
        uint buyQuantity // Quantity of sellAsset to be bought
    );

    // FIELDS

    mapping (uint => Request) public requests;
    uint public nextRequestId;

    // CONSTANT METHODS

    function getLastRequestId() constant returns (uint) {
        require(nextRequestId > 0);
        return nextRequestId - 1;
    }

    function getRequestHistory(uint start)
    		constant
    		returns (
      			address[1024] owners, uint[1024] statuses, uint[1024] requestTypes,
            uint[1024] numShares, uint[1024] offered, uint[1024] incentive,
      			uint[1024] lastFeedId, uint[1024] lastFeedTime, uint[1024] timestamp
    		)
  	{
      	for (uint i = 0; i < 1024; i++) {
        		if (start + i >= nextRequestId) break;
        		owners[i] = requests[start + i].owner;
        		statuses[i] = uint(requests[start + i].status);
        		requestTypes[i] = uint(requests[start + i].requestType);
        		numShares[i] = requests[start + i].numShares;
        		offered[i] = requests[start + i].offeredOrRequestedValue;
        		incentive[i] = requests[start + i].incentive;
        		lastFeedId[i] = requests[start + i].lastFeedUpdateId;
        		lastFeedTime[i] = requests[start + i].lastFeedUpdateTime;
        		timestamp[i] = requests[start + i].timestamp;
      	}
  	}
}
