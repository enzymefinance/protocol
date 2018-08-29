pragma solidity ^0.4.21;


/// @notice Mediation between a Fund and exchanges
interface TradingInterface {

    function addExchange(address _exchange, address _adapter) external;

    function callOnExchange(
        uint exchangeIndex,
        bytes4 method,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        uint orderId
    );

    function removeOpenMakeOrder(
        address ofExchange,
        address ofSellAsset
    );

    function orderUpdateHook(
        address ofExchange,
        bytes32 orderId,
        UpdateType updateType,
        address[2] orderAddresses,
        uint[3] orderValues
    );
    function quantityHeldInCustodyOfExchange(address ofAsset) returns (uint);
}

