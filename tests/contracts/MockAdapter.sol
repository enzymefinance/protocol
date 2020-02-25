pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "main/exchanges/libs/ExchangeAdapter.sol";
import "main/exchanges/libs/OrderFiller.sol";

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
    )
        public
        override
    {
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

    function __fillTakeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
        override
    {
        revert("Unimplemented");
    }

    function __formatFillTakeOrderArgs(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        override
        returns (address[] memory, uint256[] memory)
    {
        revert("Unimplemented");
    }

    function __validateTakeOrderParams(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        override
    {
        revert("Unimplemented");
    }
}
