pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/token/IERC20.sol";
import "../fund/trading/Trading.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/DSMath.sol";
import "./interfaces/IZeroExV2.sol";
import "./ExchangeAdapter.sol";

/// @title ZeroExV2Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV2 Exchange Contract
contract ZeroExV2Adapter is DSMath, ExchangeAdapter {
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
        onlyManager
        notShutDown
        orderAddressesMatchOrderData(orderAddresses, orderData)
    {
        IZeroExV2.Order memory order = constructOrderStruct(orderAddresses, orderValues, orderData);

        uint fillTakerQuantity = orderValues[6];
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];

        approveAssetsTakeOrder(targetExchange, order, fillTakerQuantity);

        uint takerAssetFilledAmount = executeFill(targetExchange, order, fillTakerQuantity, signature);
        require(
            takerAssetFilledAmount == fillTakerQuantity,
            "Filled amount does not match desired fill amount"
        );

        getAccounting().decreaseAssetBalance(takerAsset, takerAssetFilledAmount);
        getAccounting().increaseAssetBalance(makerAsset, orderValues[0]);

        updateStateTakeOrder(targetExchange, order, fillTakerQuantity);
    }

    // INTERNAL METHODS

    /// @notice Approves takerAsset, takerFee
    function approveAssetsTakeOrder(
        address _targetExchange,
        IZeroExV2.Order memory _order,
        uint256 _fillTakerAmount
    )
        internal
    {
        approveAsset(
            getAssetAddress(_order.takerAssetData),
            getAssetProxy(_targetExchange, _order.takerAssetData),
            _fillTakerAmount,
            "takerAsset"
        );
        uint256 takerFeeAmount = mul(_order.takerFee, _fillTakerAmount) / _order.takerAssetAmount;
        if (takerFeeAmount > 0) {
            bytes memory zrxAssetData = IZeroExV2(_targetExchange).ZRX_ASSET_DATA();
            approveAsset(
                getAssetAddress(zrxAssetData),
                getAssetProxy(_targetExchange, zrxAssetData),
                takerFeeAmount,
                "takerFeeAsset"
            );
        }
    }

    /// @dev Needed to avoid stack too deep error
    function executeFill(
        address targetExchange,
        IZeroExV2.Order memory order,
        uint256 takerAssetFillAmount,
        bytes memory signature
    )
        internal
        returns (uint256)
    {
        address makerAsset = getAssetAddress(order.makerAssetData);
        uint preMakerAssetBalance = IERC20(makerAsset).balanceOf(address(this));

        IZeroExV2.FillResults memory fillResults = IZeroExV2(targetExchange).fillOrder(
            order,
            takerAssetFillAmount,
            signature
        );

        uint256 postMakerAssetBalance = IERC20(makerAsset).balanceOf(address(this));

        // Account for case where makerAsset is ZRX (same as takerFee)
        uint256 makerAssetFeesTotal;
        if (makerAsset == getAssetAddress(IZeroExV2(targetExchange).ZRX_ASSET_DATA())) {
            makerAssetFeesTotal = add(makerAssetFeesTotal, order.takerFee);
        }

        require(
            postMakerAssetBalance == sub(
                add(preMakerAssetBalance, fillResults.makerAssetFilledAmount),
                makerAssetFeesTotal
            ),
            "Maker asset balance different than expected"
        );

        return fillResults.takerAssetFilledAmount;
    }

    /// @dev avoids stack too deep error
    function updateStateTakeOrder(
        address targetExchange,
        IZeroExV2.Order memory order,
        uint256 fillTakerQuantity
    )
        internal
    {
        address makerAsset = getAssetAddress(order.makerAssetData);
        address takerAsset = getAssetAddress(order.takerAssetData);

        getTrading().orderUpdateHook(
            targetExchange,
            IZeroExV2(targetExchange).getOrderInfo(order).orderHash,
            Trading.UpdateType.take,
            [payable(makerAsset), payable(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, fillTakerQuantity]
        );
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
