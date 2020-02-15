pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./interfaces/IOasisDex.sol";
import "./OrderFiller.sol";
import "../dependencies/DSMath.sol";

/// @title OasisDexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract OasisDexAdapter is DSMath, ExchangeAdapter, OrderFiller {
    /// @notice Takes an active order on Oasis Dex
    /// @param _targetExchange Address of the exchange
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
        uint256 fillTakerQuantity = _orderValues[6];
        (
            uint256 maxMakerQuantity,
            address makerAsset,
            uint256 maxTakerQuantity,
            address takerAsset
        ) = IOasisDex(_targetExchange).getOffer(uint256(_identifier));
        uint256 fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        require(
            makerAsset == _orderAddresses[2] && takerAsset == _orderAddresses[3],
            "Maker and taker assets do not match the order addresses"
        );
        require(
            makerAsset != takerAsset,
            "Maker and taker assets cannot be the same"
        );
        require(fillMakerQuantity <= maxMakerQuantity, "Maker amount to fill above max");
        require(fillTakerQuantity <= maxTakerQuantity, "Taker amount to fill above max");

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = formatFillTakeOrderArgs(
            _orderAddresses,
            _orderValues
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
        require(
            IOasisDex(_targetExchange).buy(uint256(_identifier), _fillExpectedAmounts[0]),
            "Oasis Dex: buy failed"
        );
    }

    function formatFillTakeOrderArgs(
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues
    )
        internal
        pure
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = _orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[1]; // taker fill amount

        return (fillAssets, fillExpectedAmounts);
    }
}
