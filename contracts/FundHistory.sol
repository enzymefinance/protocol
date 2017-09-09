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
        uint256 numShares;
        uint256 offeredOrRequestedValue;
        uint256 incentive;
        uint256 lastFeedUpdateId;
        uint256 lastFeedUpdateTime;
        uint256 timestamp;
    }

    struct Order {
        ERC20       haveToken;
        ERC20       wantToken;
        uint128     haveAmount;
        uint128     wantAmount;
        uint256     timestamp;
        OrderStatus order_status;
        OrderType   orderType;
        uint256     quantity_filled; // Buy quantity filled; Always less than buy_quantity
    }

    // FIELDS

    mapping (uint256 => Request) public requests;   ///XXX: array perhaps
    uint256 public nextRequestId;
    mapping (uint256 => Order) public orders;       ///XXX: array
    uint256 public nextOrderId;

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
      			uint[1024] haveAmount, address[1024] haveToken,
      			uint[1024] wantAmount, address[1024] wantToken,
      			uint[1024] timestamps, uint[1024] statuses,
      			uint[1024] types, uint[1024] buyQuantityFilled
    		)
  	{
        for (uint i = 0; i < 1024; i++) {
        		if (start + i >= nextOrderId) break;
        		haveAmount[i] = orders[start + i].haveAmount;
        		haveToken[i] = orders[start + i].haveToken;
        		wantAmount[i] = orders[start + i].wantAmount;
        		wantToken[i] = orders[start + i].wantToken;
        		timestamps[i] = orders[start + i].timestamp;
        		statuses[i] = uint(orders[start + i].order_status);   // cast enum
        		types[i] = uint(orders[start + i].orderType);
        		buyQuantityFilled[i] = orders[start + i].quantity_filled;
        }
  	}
}
