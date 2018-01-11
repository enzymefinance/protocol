pragma solidity ^0.4.19;

import "../ExchangeInterface.sol";
import "../thirdparty/CentralizedExchangeInterface.sol";
import "../../assets/Asset.sol";

contract CentralizedAdapter is ExchangeInterface {

    event OrderUpdated(uint id);

    // NON-CONSTANT METHODS

    /// @notice Makes an order on the given exchange
    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    /// @param onExchange Address of the exchange
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    /// @return Order id
    function makeOrder(
        address onExchange,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        external returns (uint id)
    {
        id = CentralizedExchangeInterface(onExchange).makeOrder(
            Asset(sellAsset),
            Asset(buyAsset),
            sellQuantity,
            buyQuantity
        );
        OrderUpdated(id);
    }

    /// @notice Takes an order on the given exchange
    /// @dev For this subset of adapter no immediate settlement can be expected
    /// @param onExchange Address of the exchange
    /// @param id Order id
    /// @param quantity Quantity of order to be executed (For partial taking)
    /// @return Whether the takeOrder is successfully executed
    function takeOrder(
        address onExchange,
        uint id,
        uint quantity
    )
        external returns (bool success)
    {
        revert();
    }

    /// @notice Cancels an order on the given exchange
    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    /// @param onExchange Address of the exchange
    /// @param id Order id
    /// @return Whether the order is successfully cancelled
    function cancelOrder(
        address onExchange,
        uint id
    )
        external returns (bool success)
    {
        var (sellAsset, , sellQuantity, ) = getOrder(onExchange, id);
        require(Asset(sellAsset).transferFrom(msg.sender, this, sellQuantity));
        require(Asset(sellAsset).approve(onExchange, sellQuantity));
        success = CentralizedExchangeInterface(onExchange).cancelOrder(id);
        OrderUpdated(id);
    }

    // VIEW METHODS

    function getLastOrderId(address onExchange)
        constant
        returns (uint)
    {
        return CentralizedExchangeInterface(onExchange).getLastOrderId();
    }
    function isActive(address onExchange, uint id)
        constant
        returns (bool)
    {
        return CentralizedExchangeInterface(onExchange).isActive(id);
    }
    function getOwner(address onExchange, uint id)
        constant
        returns (address)
    {
        return CentralizedExchangeInterface(onExchange).getOwner(id);
    }
    function getOrder(address onExchange, uint id)
        constant
        returns (address, address, uint, uint)
    {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = CentralizedExchangeInterface(onExchange).getOrder(id);
        return (
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        );
    }
    function getTimestamp(address onExchange, uint id)
        constant
        returns (uint)
    {
        var (, , , , , , timestamp) = CentralizedExchangeInterface(onExchange).orders(id);
        return timestamp;
    }


}
