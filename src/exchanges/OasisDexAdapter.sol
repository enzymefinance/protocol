pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./interfaces/IOasisDex.sol";
import "./OrderFiller.sol";

/// @title OasisDexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract OasisDexAdapter is ExchangeAdapter, OrderFiller {
    /// @notice Takes an active order on Oasis Dex
    /// @param _targetExchange Address of the exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [6] Fill amount : amount of taker token to fill
    /// @param _identifier Active order id
    function takeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
    {
        validateTakeOrderParams(_targetExchange, _orderAddresses, _orderValues, _identifier);

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = formatFillTakeOrderArgs(
            _targetExchange,
            _orderAddresses,
            _orderValues,
            _identifier
        );

        fillTakeOrder(
            _targetExchange,
            fillAssets,
            fillExpectedAmounts,
            _identifier
        );
    }

    function fillTakeOrder(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts,
        bytes32 _identifier
    )
        internal
        validateAndFinalizeFilledOrder(
            _targetExchange,
            _fillAssets,
            _fillExpectedAmounts
        )
    {
        // Approve taker asset
        approveAsset(_fillAssets[1], _targetExchange, _fillExpectedAmounts[1], "takerAsset");

        // Execute take order on exchange
        IOasisDex(_targetExchange).buy(uint256(_identifier), _fillExpectedAmounts[0]);
    }

    function formatFillTakeOrderArgs(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes32 _identifier
    )
        internal
        view
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        (
            uint256 maxMakerQuantity,,uint256 maxTakerQuantity,
        ) = IOasisDex(_targetExchange).getOffer(uint256(_identifier));

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = calculateExpectedFillAmount(
            maxTakerQuantity,
            maxMakerQuantity,
            _orderValues[6]
        ); // maker fill amount
        fillExpectedAmounts[1] = _orderValues[6]; // taker fill amount

        return (fillAssets, fillExpectedAmounts);
    }

    function validateTakeOrderParams(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes32 _identifier
    )
        internal
        view
    {
        (
            uint256 maxMakerQuantity,
            address makerAsset,
            uint256 maxTakerQuantity,
            address takerAsset
        ) = IOasisDex(_targetExchange).getOffer(uint256(_identifier));

        require(
            makerAsset == _orderAddresses[2],
            "validateTakeOrderParams: Order maker asset does not match the input address"
        );
        require(
            takerAsset == _orderAddresses[3],
            "validateTakeOrderParams: Order taker asset does not match the input address"
        );
        require(
            _orderValues[6] <= maxTakerQuantity,
            "validateTakeOrderParams: Taker fill amount greater than available quantity"
        );

        require(
            calculateExpectedFillAmount(
                maxTakerQuantity,
                maxMakerQuantity,
                _orderValues[6]
            ) <= maxMakerQuantity,
            "validateTakeOrderParams: Maker fill amount greater than max order quantity"
        );
    }
}
