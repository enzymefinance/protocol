pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "../dependencies/token/ERC20.i.sol";
import "./thirdparty/0x/Exchange.sol";
import "./thirdparty/ethfinex/WrapperRegistryEFX.sol";
import "./thirdparty/ethfinex/WrapperLock.sol";
import "../fund/trading/Trading.sol";
import "../fund/hub/Hub.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/DBC.sol";
import "../dependencies/math.sol";


/// @title EthfinexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and 0x Exchange Contract (version 1)
contract EthfinexAdapter is DSMath, DBC {

    WrapperRegistryEFX public tokenRegistry;

    //  METHODS

    // CONSTRUCTOR

    constructor(
        address _tokenRegistry
    ) {
        tokenRegistry = WrapperRegistryEFX(_tokenRegistry);
    }

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
        require(hub.manager() == msg.sender);
        require(hub.isShutDown() == false);
        // require(Trading(address(this)).owner() == msg.sender);
        // require(!Trading(address(this)).isShutDown());

        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, makerAssetData, takerAssetData);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];

        // Order parameter checks
        require(orderValues[4] >= now && orderValues[4] <= add(now, 1 days));
        Trading(address(this)).updateAndGetQuantityBeingTraded(address(makerAsset));
        require(!Trading(address(this)).isInOpenMakeOrder(makerAsset));

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
        // TODO: ADD back 
        // require(
        //     Accounting(hub.accounting()).isInAssetList(takerAsset) ||
        //     Trading(address(this)).getOwnedAssetsLength() < Trading(address(this)).MAX_FUND_ASSETS()
        // );

        Accounting(hub.accounting()).addAssetToOwnedAssets(makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, uint(0)]
        );
        Trading(address(this)).addOpenMakeOrder(targetExchange, makerAsset, uint256(orderInfo.orderHash));
    }

    /// @notice No Take orders on Ethfinex
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        revert();
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
        require(hub.manager() == msg.sender || hub.isShutDown() || block.timestamp >= orderValues[4]);

        address makerAsset = orderAddresses[2];
        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, makerAssetData, takerAssetData);
        LibOrder.OrderInfo memory orderInfo = Exchange(targetExchange).getOrderInfo(order);
        Exchange(targetExchange).cancelOrder(order);

        // Set the approval back to 0
        approveMakerAsset(targetExchange, makerAsset, makerAssetData, 0);
        Trading(address(this)).removeOpenMakeOrder(targetExchange, makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // TODO: delete this function if possible
    function getLastOrderId(address targetExchange)
        view
        returns (uint)
    {
        revert();
    }

    // TODO: Get order details
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
    function approveMakerAsset(address targetExchange, address makerAsset, bytes makerAssetData, uint makerQuantity)
        internal
    {
        Hub hub = Hub(Trading(address(this)).hub());
        Vault vault = Vault(hub.vault());
        vault.withdraw(makerAsset, makerQuantity);
        address wrappedToken = tokenRegistry.token2WrapperLookup(makerAsset);
        ERC20(makerAsset).approve(wrappedToken, makerQuantity);
        WrapperLock(wrappedToken).deposit(makerQuantity, 1);
        address assetProxy = getAssetProxy(targetExchange, makerAssetData);
        require(ERC20(wrappedToken).approve(assetProxy, makerQuantity));
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
