pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "main/exchanges/ExchangeAdapter.sol";
import "main/exchanges/OrderFiller.sol";

contract MockAdapter is ExchangeAdapter, OrderFiller {

    //  METHODS

    //  PUBLIC METHODS

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
        uint fillTakerQuantity = orderValues[6];

        __approveAsset(takerAsset, targetExchange, fillTakerQuantity, "takerAsset");
        __getAccounting().decreaseAssetBalance(takerAsset, fillTakerQuantity);
        __getAccounting().increaseAssetBalance(makerAsset, makerQuantity);

        emit OrderFilled(
            targetExchange,
            makerAsset,
            makerQuantity,
            takerAsset,
            fillTakerQuantity,
            new address[](0),
            new uint256[](0)
        );
    }
}
