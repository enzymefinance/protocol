pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./OrderFiller.sol";
import "../dependencies/DSMath.sol";
import "./interfaces/IZeroExV2.sol";

/// @title ZeroExV2Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV2 Exchange Contract
contract ZeroExV2Adapter is DSMath, ExchangeAdapter, OrderFiller {
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderData [0] Order maker asset data
    /// @param orderData [1] Order taker asset data
    modifier orderAddressesMatchOrderData(
        address[8] memory orderAddresses,
        bytes[4] memory orderData
    )
    {
        require(
            getAssetAddress(orderData[0]) == orderAddresses[2],
            "Maker asset data does not match order address in array"
        );
        require(
            getAssetAddress(orderData[1]) == orderAddresses[3],
            "Taker asset data does not match order address in array"
        );
        _;
    }

    //  METHODS

    //  PUBLIC METHODS

    // Responsibilities of takeOrder are:
    // - check sender
    // - check fund not shut down
    // - check not buying own fund tokens
    // - check price exists for asset pair
    // - check price is recent
    // - check price passes risk management
    // - approve funds to be traded (if necessary)
    // - take order from the exchange
    // - check order was taken (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Takes an active order on the selected exchange
    /// @dev These orders are expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [1] Order taker
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderAddresses [4] feeRecipientAddress
    /// @param orderAddresses [5] senderAddress
    /// @param orderValues [0] makerAssetAmount
    /// @param orderValues [1] takerAssetAmount
    /// @param orderValues [2] Maker fee
    /// @param orderValues [3] Taker fee
    /// @param orderValues [4] expirationTimeSeconds
    /// @param orderValues [5] Salt/nonce
    /// @param orderValues [6] Fill amount: amount of taker token to be traded
    /// @param orderValues [7] Dexy signature mode
    /// @param orderData [0] Encoded data specific to maker asset
    /// @param orderData [1] Encoded data specific to taker asset
    /// @param orderData [2] Encoded data specific to maker asset fee
    /// @param orderData [3] Encoded data specific to taker asset fee
    /// @param identifier Order identifier
    /// @param signature Signature of the order.
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
        orderAddressesMatchOrderData(orderAddresses, orderData)
    {
        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = formatFillTakeOrderArgs(
            targetExchange,
            orderAddresses,
            orderValues
        );

        fillTakeOrder(
            targetExchange,
            fillAssets,
            fillExpectedAmounts,
            constructOrderStruct(orderAddresses, orderValues, orderData),
            signature
        );
    }

    // INTERNAL METHODS

    // Approves takerAsset, takerFee
    function approveAssetsTakeOrder(
        address _targetExchange,
        IZeroExV2.Order memory _order,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        // Taker asset
        approveAsset(
            getAssetAddress(_order.takerAssetData),
            getAssetProxy(_targetExchange, _order.takerAssetData),
            _fillExpectedAmounts[1],
            "takerAsset"
        );
        // Taker fee asset
        if (_order.takerFee > 0) {
            bytes memory zrxAssetData = IZeroExV2(_targetExchange).ZRX_ASSET_DATA();
            approveAsset(
                getAssetAddress(zrxAssetData),
                getAssetProxy(_targetExchange, zrxAssetData),
                _fillExpectedAmounts[2],
                "takerFeeAsset"
            );
        }
    }

    function fillTakeOrder(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts,
        IZeroExV2.Order memory _order,
        bytes memory _signature
    )
        internal
        validateAndFinalizeFilledOrder(
            _targetExchange,
            _fillAssets,
            _fillExpectedAmounts
        )
    {
        // Approve taker and taker fee assets
        approveAssetsTakeOrder(_targetExchange, _order, _fillExpectedAmounts);

        // Execute take order on exchange
        IZeroExV2(_targetExchange).fillOrder(_order, _fillExpectedAmounts[1], _signature);
    }

    // VIEW METHODS

    function constructOrderStruct(
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData
    )
        internal
        view
        returns (IZeroExV2.Order memory order)
    {
        order = IZeroExV2.Order({
            makerAddress: orderAddresses[0],
            takerAddress: orderAddresses[1],
            feeRecipientAddress: orderAddresses[4],
            senderAddress: orderAddresses[5],
            makerAssetAmount: orderValues[0],
            takerAssetAmount: orderValues[1],
            makerFee: orderValues[2],
            takerFee: orderValues[3],
            expirationTimeSeconds: orderValues[4],
            salt: orderValues[5],
            makerAssetData: orderData[0],
            takerAssetData: orderData[1]
        });
    }

    function formatFillTakeOrderArgs(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues
    )
        internal
        view
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](3);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset
        fillAssets[2] = getAssetAddress(IZeroExV2(_targetExchange).ZRX_ASSET_DATA()); // taker fee asset

        uint256[] memory fillExpectedAmounts = new uint256[](3);
        fillExpectedAmounts[0] = _orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[1]; // taker fill amount
        fillExpectedAmounts[2] = _orderValues[3]; // taker fee amount

        return (fillAssets, fillExpectedAmounts);
    }


    function getAssetProxy(address targetExchange, bytes memory assetData)
        internal
        view
        returns (address assetProxy)
    {
        bytes4 assetProxyId;
        assembly {
            assetProxyId := and(mload(
                add(assetData, 32)),
                0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }
        assetProxy = IZeroExV2(targetExchange).getAssetProxy(assetProxyId);
    }

    function getAssetAddress(bytes memory assetData)
        internal
        view
        returns (address assetAddress)
    {
        assembly {
            assetAddress := mload(add(assetData, 36))
        }
    }
}
