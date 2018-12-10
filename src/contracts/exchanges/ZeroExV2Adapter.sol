pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "ERC20.i.sol";
import "Trading.sol";
import "Hub.sol";
import "Vault.sol";
import "Accounting.sol";
import "DBC.sol";
import "math.sol";
import "Exchange.sol";
import "ExchangeAdapterInterface.sol";

/// @title ZeroExV2Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and 0x Exchange Contract (version 1)
contract ZeroExV2Adapter is DSMath, DBC, ExchangeAdapterInterface {

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order by pre-approving signatures
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
        require(hub.manager() == msg.sender, "Manager must be sender");
        require(hub.isShutDown() == false, "Hub is shut down");

        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, makerAssetData, takerAssetData);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];

        // Order parameter checks
        Trading(address(this)).updateAndGetQuantityBeingTraded(address(makerAsset));
        require(
            !Trading(address(this)).isInOpenMakeOrder(makerAsset),
            "This asset is already in an open make order"
        );

        approveMakerAsset(targetExchange, makerAsset, makerAssetData, order.makerAssetAmount);
        LibOrder.OrderInfo memory orderInfo = Exchange(targetExchange).getOrderInfo(order);
        Exchange(targetExchange).preSign(orderInfo.orderHash, address(this), signature);

        require(
            Exchange(targetExchange).isValidSignature(
                orderInfo.orderHash,
                address(this),
                signature
            ),
            "INVALID_ORDER_SIGNATURE"
        );
        require(
            Accounting(hub.accounting()).isInAssetList(takerAsset) ||
            Accounting(hub.accounting()).getOwnedAssetsLength() < Accounting(hub.accounting()).MAX_OWNED_ASSETS(),
            "Max owned asset limit reached"
        );

        Accounting(hub.accounting()).addAssetToOwnedAssets(takerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, uint(0)]
        );
        Trading(address(this)).addOpenMakeOrder(targetExchange, makerAsset, uint256(orderInfo.orderHash), orderValues[4]);
        Trading(address(this)).addZeroExOrderData(orderInfo.orderHash, order);
    }

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
    /// @param identifier Order identifier
    /// @param makerAssetData Encoded data specific to makerAsset.
    /// @param takerAssetData Encoded data specific to takerAsset.
    /// @param signature Signature of the order.
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender, "Manager must be sender");
        require(hub.isShutDown() == false, "Hub is shut down");

        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, makerAssetData, takerAssetData);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint fillTakerQuantity = orderValues[6];

        approveTakerAsset(targetExchange, takerAsset, takerAssetData, fillTakerQuantity);
        LibOrder.OrderInfo memory orderInfo = Exchange(targetExchange).getOrderInfo(order);
        uint takerAssetFilledAmount = executeFill(targetExchange, order, fillTakerQuantity, signature);

        require(
            takerAssetFilledAmount == fillTakerQuantity,
            "Filled amount does not match desired fill amount"
        );
        require(
            Accounting(hub.accounting()).isInAssetList(makerAsset) ||
            Accounting(hub.accounting()).getOwnedAssetsLength() < Accounting(hub.accounting()).MAX_OWNED_ASSETS(),
            "Max owned asset limit reached"
        );

        Accounting(hub.accounting()).addAssetToOwnedAssets(makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.take,
            [makerAsset, takerAsset],
            [order.makerAssetAmount, order.takerAssetAmount, fillTakerQuantity]
        );
    }

    /// @notice Cancel the 0x make order
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
        require(
            hub.manager() == msg.sender || hub.isShutDown() == false,
            "Manager must be sender or fund must be shut down"
        );

        LibOrder.Order memory order = Trading(address(this)).getZeroExOrderDetails(identifier);
        address makerAsset = getAssetAddress(order.makerAssetData);
        Exchange(targetExchange).cancelOrder(order);

        // Set the approval back to 0
        approveMakerAsset(targetExchange, makerAsset, order.makerAssetData, 0);
        Trading(address(this)).removeOpenMakeOrder(targetExchange, makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            identifier,
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    /// @dev Get order details
    function getOrder(address targetExchange, uint id, address makerAsset)
        view
        returns (address, address, uint, uint)
    {
        var (orderId, , orderIndex) = Trading(msg.sender).getOpenOrderInfo(targetExchange, makerAsset);
        var (, takerAsset, makerQuantity, takerQuantity) = Trading(msg.sender).getOrderDetails(orderIndex);
        uint takerAssetFilledAmount = Exchange(targetExchange).filled(bytes32(orderId));
        if (Exchange(targetExchange).cancelled(bytes32(orderId)) || sub(takerQuantity, takerAssetFilledAmount) == 0) {
            return (makerAsset, takerAsset, 0, 0);
        }
        return (makerAsset, takerAsset, makerQuantity, sub(takerQuantity, takerAssetFilledAmount));
    }

    // INTERNAL METHODS


    /// @notice needed to avoid stack too deep error
    function approveTakerAsset(address targetExchange, address takerAsset, bytes takerAssetData, uint fillTakerQuantity)
        internal
    {
        Hub hub = Hub(Trading(address(this)).hub());
        Vault vault = Vault(hub.vault());
        vault.withdraw(takerAsset, fillTakerQuantity);
        address assetProxy = getAssetProxy(targetExchange, takerAssetData);
        require(
            ERC20(takerAsset).approve(assetProxy, fillTakerQuantity),
            "Taker asset could not be approved"
        );
    }

    /// @notice needed to avoid stack too deep error
    function approveMakerAsset(address targetExchange, address makerAsset, bytes makerAssetData, uint makerQuantity)
        internal
    {
        Hub hub = Hub(Trading(address(this)).hub());
        Vault vault = Vault(hub.vault());
        vault.withdraw(makerAsset, makerQuantity);
        address assetProxy = getAssetProxy(targetExchange, makerAssetData);
        require(
            ERC20(makerAsset).approve(assetProxy, makerQuantity),
            "Maker asset could not be approved"
        );
    }

    /// @dev needed to avoid stack too deep error
    function executeFill(
        address targetExchange,
        LibOrder.Order memory order,
        uint256 takerAssetFillAmount,
        bytes signature
    )
        internal
        returns (uint)
    {
        uint takerFee = order.takerFee;
        if (takerFee > 0) {
            bytes memory assetData = Exchange(targetExchange).ZRX_ASSET_DATA();
            address zrxProxy = getAssetProxy(targetExchange, assetData);
            Hub hub = Hub(Trading(address(this)).hub());
            Vault vault = Vault(hub.vault());
            vault.withdraw(getAssetAddress(assetData), takerFee);
            require(
                ERC20(getAssetAddress(assetData)).approve(zrxProxy, takerFee),
                "Fee asset could not be approved"
            );
        }

        address makerAsset = getAssetAddress(order.makerAssetData);
        uint preMakerAssetBalance = ERC20(makerAsset).balanceOf(this);

        LibFillResults.FillResults memory fillResults = Exchange(targetExchange).fillOrder(
            order,
            takerAssetFillAmount,
            signature
        );

        uint postMakerAssetBalance = ERC20(makerAsset).balanceOf(this);
        require(
            postMakerAssetBalance == add(preMakerAssetBalance, fillResults.makerAssetFilledAmount),
            "Maker asset balance different than expected"
        );

        return fillResults.takerAssetFilledAmount;
    }

    // VIEW METHODS

    function constructOrderStruct(
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes makerAssetData,
        bytes takerAssetData
    )
        internal
        view
        returns (LibOrder.Order memory order)
    {
        order = LibOrder.Order({
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
            makerAssetData: makerAssetData,
            takerAssetData: takerAssetData
        });
    }

    function getAssetProxy(address targetExchange, bytes assetData)
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
        assetProxy = Exchange(targetExchange).getAssetProxy(assetProxyId);
    }

    function getAssetAddress(bytes assetData)
        internal
        view
        returns (address assetAddress)
    {
        assembly {
            assetAddress := mload(add(assetData, 36))
        }
    }
}
