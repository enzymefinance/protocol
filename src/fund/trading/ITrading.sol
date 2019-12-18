pragma solidity 0.5.15;

/// @notice Mediation between a Fund and exchanges
interface ITrading {
    function callOnExchange(
        uint exchangeIndex,
        string calldata methodSignature,
        address[6] calldata orderAddresses,
        uint[8] calldata orderValues,
        bytes32 identifier,
        bytes calldata makerAssetData,
        bytes calldata takerAssetData,
        bytes calldata signature
    ) external;

    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        address ofBuyAsset,
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
