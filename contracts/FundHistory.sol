pragma solidity ^0.4.11;

import './dependencies/ERC20.sol';

/// @title Fund Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple vault
contract FundHistory {

    // TYPES

    enum RequestStatus {
        open,
        cancelled,
        executed
    }

     enum RequestType {
        subscribe,
        redeem
     }

    enum OrderStatus {
        open,
        partiallyFilled,
        fullyFilled,
        cancelled
    }

    enum OrderType {
        make,
        take
    }

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

    struct Order {
        address sellAsset;
        address buyAsset;
        uint sellQuantity;
        uint buyQuantity;
        uint timestamp;
        OrderStatus status;
        OrderType orderType;
        uint fillQuantity; // Buy quantity filled; Always less than buy_quantity
    }

    // EVENTS

    event LogRequest(address owner,
            RequestStatus status,
            RequestType requestType,
            uint numShares,
            uint offeredOrRequestedValue,
            uint incentive,
            uint lastFeedUpdateId,
            uint lastFeedUpdateTime,
            uint timestamp);

    // FIELDS

    mapping (uint => Request) public requests;   ///XXX: array perhaps
    uint public nextRequestId;
    mapping (uint => Order) public orders;       ///XXX: array
    uint public nextOrderId;

    // CONSTANT METHODS

    function getLastRequestId() constant returns (uint) {
        require(nextRequestId > 0);
        return nextRequestId - 1;
    }
    function getLastOrderId() constant returns (uint) {
        require(nextOrderId > 0);
        return nextOrderId - 1;
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

  	function getOrderHistory(uint start)
    		constant
    		returns (
      			uint[1024] sellQuantity, address[1024] sellAsset,
      			uint[1024] buyQuantity, address[1024] buyAsset,
      			uint[1024] timestamps, uint[1024] statuses,
      			uint[1024] types, uint[1024] buyQuantityFilled
    		)
  	{
        for (uint i = 0; i < 1024; i++) {
        		if (start + i >= nextOrderId) break;
        		sellQuantity[i] = orders[start + i].sellQuantity;
        		sellAsset[i] = orders[start + i].sellAsset;
        		buyQuantity[i] = orders[start + i].buyQuantity;
        		buyAsset[i] = orders[start + i].buyAsset;
        		timestamps[i] = orders[start + i].timestamp;
        		statuses[i] = uint(orders[start + i].status);   // cast enum
        		types[i] = uint(orders[start + i].orderType);
        		buyQuantityFilled[i] = orders[start + i].fillQuantity;
        }
  	}
}
