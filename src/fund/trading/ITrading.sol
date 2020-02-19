pragma solidity 0.6.1;

pragma experimental ABIEncoderV2;

// TODO: Restore indexed params

/// @notice Mediation between a Fund and exchanges
interface ITrading {
    function callOnExchange(
        uint exchangeIndex,
        string calldata methodSignature,
        address[8] calldata orderAddresses,
        uint[8] calldata orderValues,
        bytes[4] calldata orderData,
        bytes32 identifier,
        bytes calldata signature
    ) external;

    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        address ofBuyAsset,
        address ofFeeAsset,
        uint orderId,
        uint expiryTime
    ) external;

    function removeOpenMakeOrder(
        address ofExchange,
        address ofSellAsset
    ) external;

    function updateAndGetQuantityBeingTraded(address _asset) external returns (uint256);
    function getOpenMakeOrdersAgainstAsset(address _asset) external view returns (uint256);
}

interface ITradingFactory {
     function createInstance(
        address _hub,
        address[] calldata _exchanges,
        address[] calldata _adapters,
        address _registry
    ) external returns (address);
}
