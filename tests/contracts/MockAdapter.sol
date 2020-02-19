pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "main/fund/trading/Trading.sol";
import "main/fund/accounting/Accounting.sol";
import "main/exchanges/ExchangeAdapter.sol";

contract MockAdapter is ExchangeAdapter {

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Mock make order
    function makeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override {
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        approveAsset(makerAsset, targetExchange, makerQuantity, "makerAsset");

        getTrading().orderUpdateHook(
            targetExchange,
            identifier,
            Trading.UpdateType.make,
            [payable(makerAsset), payable(takerAsset)],
            [makerQuantity, takerQuantity, uint(0)]
        );
        getTrading().addOpenMakeOrder(targetExchange, makerAsset, takerAsset, address(0), uint(identifier), 0);
    }

    /// @notice Mock take order
    function takeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override {
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];
        uint fillTakerQuantity = orderValues[6];

        approveAsset(takerAsset, targetExchange, fillTakerQuantity, "takerAsset");

        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.take,
            [payable(makerAsset), payable(takerAsset)],
            [makerQuantity, takerQuantity, fillTakerQuantity]
        );
    }

    /// @notice Mock cancel order
    function cancelOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override {
        address makerAsset = orderAddresses[2];
        uint makerQuantity = orderValues[0];

        revokeApproveAsset(makerAsset, targetExchange, makerQuantity, "makerAsset");

        getTrading().removeOpenMakeOrder(targetExchange, makerAsset);
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }
}
