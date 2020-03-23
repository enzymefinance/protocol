pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../interfaces/IOasisDex.sol";
import "../libs/ExchangeAdapter.sol";
import "../libs/OrderTaker.sol";

/// @title OasisDexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract OasisDexAdapter is ExchangeAdapter, OrderTaker {
    /// @notice Takes an active order on Oasis Dex (takeOrder)
    /// @param _targetExchange Address of the Oasis Dex exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [6] Taker asset fill quantity
    /// @param _identifier Order id on Oasis Dex
    /// @param _fillData Encoded data to pass to OrderFiller
    function __fillTakeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature,
        bytes memory _fillData
    )
        internal
        override
        validateAndFinalizeFilledOrder(_targetExchange, _fillData)
    {
        (,uint256[] memory fillExpectedAmounts,) = __decodeOrderFillData(_fillData);

        // Execute take order on exchange
        IOasisDex(_targetExchange).buy(uint256(_identifier), fillExpectedAmounts[0]);
    }

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _targetExchange Address of the Oasis Dex exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [6] Taker asset fill quantity
    /// @param _identifier Order id on Oasis Dex
    /// @return _fillAssets Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return _fillExpectedAmounts Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
    /// @return _fillApprovalTargets Recipients of assets in fill order
    /// - [0] Taker (fund), set to address(0)
    /// - [1] Oasis Dex exchange (_targetExchange)
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
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        (
            uint256 maxMakerQuantity,,uint256 maxTakerQuantity,
        ) = IOasisDex(_targetExchange).getOffer(uint256(_identifier));

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = __calculateRelativeQuantity(
            maxTakerQuantity,
            maxMakerQuantity,
            _orderValues[6]
        ); // maker fill amount
        fillExpectedAmounts[1] = _orderValues[6]; // taker fill amount

        address[] memory fillApprovalTargets = new address[](2);
        fillApprovalTargets[0] = address(0); // Fund (Use 0x0)
        fillApprovalTargets[1] = _targetExchange; // Oasis Dex exchange

        return (fillAssets, fillExpectedAmounts, fillApprovalTargets);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _targetExchange Address of the Oasis Dex exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [6] Taker asset fill quantity
    /// @param _identifier Order id on Oasis Dex
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
        (
            ,
            address makerAsset,
            uint256 maxTakerQuantity,
            address takerAsset
        ) = IOasisDex(_targetExchange).getOffer(uint256(_identifier));

        require(
            makerAsset == _orderAddresses[2],
            "__validateTakeOrderParams: Order maker asset does not match the input"
        );
        require(
            takerAsset == _orderAddresses[3],
            "__validateTakeOrderParams: Order taker asset does not match the input"
        );
        require(
            _orderValues[6] <= maxTakerQuantity,
            "__validateTakeOrderParams: Taker fill amount greater than available quantity"
        );
    }
}
