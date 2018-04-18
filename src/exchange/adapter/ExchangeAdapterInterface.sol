pragma solidity ^0.4.20;

contract ExchangeAdapterInterface {
    enum UpdateTypes {
        Make,
        Take,
        Cancel
    }
    event OrderUpdated(address exchange, bytes32 orderId, UpdateTypes updateType);

    function makeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    );

    function takeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    );

    function cancelOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    );
}
