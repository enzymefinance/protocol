pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "../dependencies/token/ERC20.i.sol";
import "../fund/trading/Trading.sol";
import "../fund/hub/Hub.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/token/WETH9.sol";
import "../dependencies/DBC.sol";
import "../dependencies/math.sol";
import "./thirdparty/ethfinex/ExchangeEfx.sol";
import "./thirdparty/ethfinex/WrapperLock.sol";
import "./thirdparty/ethfinex/WrapperLockEth.sol";
import "./ExchangeAdapterInterface.sol";


/// @title EthfinexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and 0x Exchange Contract (version 1)
contract EthfinexAdapter is DSMath, DBC, ExchangeAdapterInterface {

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order by pre-approving signatures
    function makeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes wrappedMakerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender, "Manager must be sender");
        require(hub.isShutDown() == false, "Hub is shut down");

        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, wrappedMakerAssetData, takerAssetData);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];

        // Order parameter checks
        require(
            orderValues[4] >= now && orderValues[4] <= add(now, 1 days),
            "Expiration time must be less than 1 day from now and great than now"
        );
        Trading(address(this)).updateAndGetQuantityBeingTraded(address(makerAsset));
        require(
            !Trading(address(this)).isInOpenMakeOrder(makerAsset),
            "This asset is already in an open make order"
        );
        wrapMakerAsset(targetExchange, makerAsset, wrappedMakerAssetData, order.makerAssetAmount, order.expirationTimeSeconds);
        LibOrder.OrderInfo memory orderInfo = ExchangeEfx(targetExchange).getOrderInfo(order);
        ExchangeEfx(targetExchange).preSign(orderInfo.orderHash, address(this), signature);

        require(
            ExchangeEfx(targetExchange).isValidSignature(
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
        Trading(address(this)).addOpenMakeOrder(targetExchange, makerAsset, uint256(orderInfo.orderHash));
        Trading(address(this)).addZeroExOrderData(orderInfo.orderHash, order);
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
        bytes wrappedMakerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        require(
            hub.manager() == msg.sender || hub.isShutDown() == false,
            "Manager must be sender or fund must be shut down"
        );
        LibOrder.Order memory order = Trading(address(this)).getZeroExOrderDetails(identifier);
        ExchangeEfx(targetExchange).cancelOrder(order);

        // Order is not removed from OpenMakeOrder mapping as it's needed for accounting (wrapped tokens)
        // address makerAsset = ExchangeEfx(targetExchange).token2WrapperLookup(getAssetAddress(order.makerAssetData));
        // Trading(address(this)).removeOpenMakeOrder(targetExchange, makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            identifier,
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    /// @notice Unwrap (withdraw) tokens, uses orderAddresses for input list of tokens to be unwrapped
    function withdrawTokens(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        // TODO: Change to Native Asset or Wrapped Native Asset?
        address nativeAsset = Accounting(hub.accounting()).QUOTE_ASSET();

        for (uint i = 0; i < orderAddresses.length; i++) {
            // Check if the input token address is null address
            if (orderAddresses[i] == address(0)) continue;
            address wrappedToken = ExchangeEfx(targetExchange).wrapper2TokenLookup(orderAddresses[i]);
            uint balance = WrapperLock(wrappedToken).balanceOf(address(this));
            WrapperLock(wrappedToken).withdraw(balance, 0, bytes32(0), bytes32(0), 0);
            if (orderAddresses[i] == nativeAsset) {
                WETH9(nativeAsset).deposit.value(balance)();
            }
            Trading(address(this)).removeOpenMakeOrder(targetExchange, orderAddresses[i]);
        }
    }

    // TODO: delete this function if possible
    function getLastOrderId(address targetExchange)
        view
        returns (uint)
    {
        revert();
    }

    // TODO: Get order details. Minor: Wrapped tokens directly sent to the fund are not accounted
    function getOrder(address targetExchange, uint id, address makerAsset)
        view
        returns (address, address, uint, uint)
    {
        var (orderId, , orderIndex) = Trading(msg.sender).getOpenOrderInfo(targetExchange, makerAsset);
        var (, takerAsset, makerQuantity, takerQuantity) = Trading(msg.sender).getOrderDetails(orderIndex);

        // Check if order has been completely filled
        uint takerAssetFilledAmount = ExchangeEfx(targetExchange).filled(bytes32(orderId));
        if (sub(takerQuantity, takerAssetFilledAmount) == 0) {
            return (makerAsset, takerAsset, 0, 0);
        }

        // Check if tokens have been withdrawn (cancelled order may still need to be accounted if there is balance)
        uint balance = WrapperLock(ExchangeEfx(targetExchange).wrapper2TokenLookup(makerAsset)).balanceOf(msg.sender);
        if (balance == 0) {
            return (makerAsset, takerAsset, 0, 0);
        }
        return (makerAsset, takerAsset, makerQuantity, sub(takerQuantity, takerAssetFilledAmount));
    }

    // INTERNAL METHODS

    /// @notice needed to avoid stack too deep error
    /// @dev deposit time should be greater than 1 hour
    function wrapMakerAsset(address targetExchange, address makerAsset, bytes wrappedMakerAssetData, uint makerQuantity, uint orderExpirationTime)
        internal
    {
        Hub hub = Hub(Trading(address(this)).hub());
        Vault vault = Vault(hub.vault());
        vault.withdraw(makerAsset, makerQuantity);
        address wrappedToken = ExchangeEfx(targetExchange).wrapper2TokenLookup(makerAsset);
        // Deposit to rounded up value of time difference of expiration time and current time (in hours)
        uint depositTime = (sub(orderExpirationTime, now) / 1 hours) + 1;

        // Handle case for WETH
        address nativeAsset = Accounting(hub.accounting()).QUOTE_ASSET();
        if (makerAsset == nativeAsset) {
            WETH9(nativeAsset).withdraw(makerQuantity);
            WrapperLockEth(wrappedToken).deposit.value(makerQuantity)(makerQuantity, depositTime);
        } else {
            ERC20(makerAsset).approve(wrappedToken, makerQuantity);
            WrapperLock(wrappedToken).deposit(makerQuantity, depositTime);
        }
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
        assetProxy = ExchangeEfx(targetExchange).getAssetProxy(assetProxyId);
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
