pragma solidity ^0.4.25;

pragma experimental ABIEncoderV2;

// TODO: Restore indexed params

/// @notice Mediation between a Fund and exchanges
interface TradingInterface {
    event ExchangeMethodCall(
        // address indexed exchangeAddress,
        // string indexed methodSignature,
        address exchangeAddress,
        string methodSignature,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes[4] orderData,
        bytes32 identifier,
        bytes signature
    );

    function callOnExchange(
        uint exchangeIndex,
        string methodSignature,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes[4] orderData,
        bytes32 identifier,
        bytes signature
    ) public;

    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        address ofBuyAsset,
        uint orderId,
        uint expiryTime
    ) public;

    function removeOpenMakeOrder(
        address ofExchange,
        address ofSellAsset
    ) public;
}

interface TradingFactoryInterface {
     function createInstance(
        address _hub,
        address[] _exchanges,
        address[] _adapters,
        address _registry
    ) public returns (address);
}
