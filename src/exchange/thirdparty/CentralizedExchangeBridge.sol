pragma solidity ^0.4.21;

import "../../assets/Asset.sol";
import "../../dependencies/Owned.sol";

contract CentralizedExchangeBridge is Owned {

    // TYPES

    struct OrderInfo {
        address  sellAsset;
        address  buyAsset;
        uint     sellQuantity;
        uint     buyQuantity;
        address  creator;
        bool     active;
        uint64   timestamp;
    }

    // FIELDS

    // Methods fields
    mapping (uint => OrderInfo) public orders;
    uint public lastOrderId; // Last Order id

    // METHODS

    // EXTERNAL : SETTLEMENT

    /// @notice Makes an order, transfers sellQuantity of sellAsset to the owner
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset expected to be settled / returned
    function makeOrder(address sellAsset, address buyAsset, uint sellQuantity, uint buyQuantity)
    returns (uint orderId)
    {
        require(Asset(sellAsset).transferFrom(msg.sender, this, sellQuantity));
        require(Asset(sellAsset).transfer(owner, sellQuantity));
        orderId = ++lastOrderId;
        orders[orderId] = OrderInfo({
            sellAsset: sellAsset,
            buyAsset: buyAsset,
            sellQuantity: sellQuantity,
            buyQuantity: buyQuantity,
            creator: msg.sender,
            active: true,
            timestamp: uint64(now)
        });
    }

    /// @notice Settles an order by transfering buyAsset to the order creator
    /// @dev settleQuantity should be greater than or equal to the buyQuantity
    /// @param orderId Active order id
    /// @param settleQuantity Quantity of buyAsset to be settled / returned
    function settleOrder(uint orderId, uint settleQuantity) returns (bool success) {
        OrderInfo order = orders[orderId];
        require(settleQuantity >= order.buyQuantity);
        require(Asset(order.buyAsset).transferFrom(msg.sender, this, settleQuantity));
        require(Asset(order.buyAsset).transfer(order.creator, settleQuantity));
        order.sellQuantity = 0;
        order.active = false;
        success = true;
    }

    /// @notice Cancels an order by returning the sellQuantity to the order creator
    /// @param orderId Active order id
    function cancelOrder(uint orderId) returns (bool success) {
        OrderInfo order = orders[orderId];
        require(Asset(order.sellAsset).transferFrom(msg.sender, this, order.sellQuantity));
        require(Asset(order.sellAsset).transfer(msg.sender, order.sellQuantity));
        order.sellQuantity = 0;
        order.active = false;
        success = true;
    }

    // PUBLIC VIEW METHODS

    function isActive(uint orderId) view returns (bool) {
        return orders[orderId].active;
    }

    function getOwner(uint orderId) view returns (address) {
        return orders[orderId].creator;
    }

    function getOrder(uint orderId) view returns (uint, address, uint, address) {
        var order = orders[orderId];
        return (
            order.sellQuantity,
            order.sellAsset,
            order.buyQuantity,
            order.buyAsset
        );
    }

    function getLastOrderId() view returns (uint) { return lastOrderId; }
}
