pragma solidity ^0.4.21;

interface ExchangeAdapterInterface {
    function makeOrder(
        address targetExchange,
        address[4] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    );

    function takeOrder(
        address targetExchange,
        address[4] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    );

    function cancelOrder(
        address targetExchange,
        address[4] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    );
}
