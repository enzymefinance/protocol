pragma solidity ^0.4.21;

import "Trading.sol";
import "Hub.sol";
import "Accounting.sol";
import "ExchangeAdapterInterface.sol";

contract MockAdapter is ExchangeAdapterInterface {

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Mock make order
    function makeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        Trading(address(this)).orderUpdateHook(
            targetExchange,
            identifier,
            Trading.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [makerQuantity, takerQuantity, uint(0)]
        );
        Trading(address(this)).addOpenMakeOrder(targetExchange, makerAsset, uint(identifier), 0);
    }

    /// @notice Mock take order
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];
        uint fillTakerQuantity = orderValues[6];

        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.take,
            [address(makerAsset), address(takerAsset)],
            [makerQuantity, takerQuantity, fillTakerQuantity]
        );
    }

    /// @notice Mock cancel order
    function cancelOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        address makerAsset = orderAddresses[2];

        Trading(address(this)).removeOpenMakeOrder(targetExchange, makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // VIEW FUNCTIONS

    /// @dev Dummy function; not implemented on exchange
    function getOrder(
        address targetExchange,
        uint id,
        address makerAsset
    )
        view
        returns (address, address, uint, uint)
    {
        revert("Unimplemented");
    }
}
