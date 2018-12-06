pragma solidity ^0.4.21;


/// @notice Mediation between a Fund and exchanges
interface TradingInterface {

    function callOnExchange(
        uint exchangeIndex,
        string methodSignature,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    );

    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        uint orderId,
        uint expiryTime
    );

    function removeOpenMakeOrder(
        address ofExchange,
        address ofSellAsset
    );
}

