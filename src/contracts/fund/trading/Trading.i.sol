pragma solidity ^0.5.13;

/// @notice Mediation between a Fund and exchanges
interface TradingInterface {
    event ExchangeMethodCall(
        address indexed exchangeAddress,
        string indexed methodSignature,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    );

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

interface TradingFactoryInterface {
     function createInstance(
        address _hub,
        address[] calldata _exchanges,
        address[] calldata _adapters,
        address _registry
    ) external returns (address);
}
