pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "ERC20.i.sol";
import "Trading.sol";
import "Hub.sol";
import "Vault.sol";
import "Accounting.sol";
import "Registry.sol";
import "WETH9.sol";
import "DBC.sol";
import "math.sol";
import "ExchangeEfx.sol";
import "WrapperLock.sol";
import "WrapperLockEth.sol";
import "ExchangeAdapter.sol";
import "WrapperRegistryEFX.sol";

/// @title EthfinexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to EthFinex exchange
contract EthfinexAdapter is DSMath, DBC, ExchangeAdapter {

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
    ) onlyManager notShutDown {
        Hub hub = getHub();

        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, wrappedMakerAssetData, takerAssetData);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];

        // Order parameter checks
        getTrading().updateAndGetQuantityBeingTraded(makerAsset);
        ensureNotInOpenMakeOrder(makerAsset);

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
        getAccounting().addAssetToOwnedAssets(takerAsset);
        getTrading().orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, uint(0)]
        );
        getTrading().addOpenMakeOrder(targetExchange, makerAsset, uint256(orderInfo.orderHash), order.expirationTimeSeconds);
        getTrading().addZeroExOrderData(orderInfo.orderHash, order);
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
    ) onlyCancelPermitted(targetExchange, orderAddresses[2]) {
        Hub hub = getHub();

        LibOrder.Order memory order = getTrading().getZeroExOrderDetails(identifier);
        ExchangeEfx(targetExchange).cancelOrder(order);

        getAccounting().updateOwnedAssets();
        // Order is not removed from OpenMakeOrder mapping as it's needed for accounting (wrapped tokens)
        getTrading().orderUpdateHook(
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
        Hub hub = getHub();
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();

        for (uint i = 0; i < orderAddresses.length; i++) {
            // Check if the input token address is null address
            if (orderAddresses[i] == address(0)) continue;
            address wrappedToken = getWrapperToken(orderAddresses[i]);
            uint balance = WrapperLock(wrappedToken).balanceOf(address(this));
            WrapperLock(wrappedToken).withdraw(balance, 0, bytes32(0), bytes32(0), 0);
            if (orderAddresses[i] == nativeAsset) {
                WETH9(nativeAsset).deposit.value(balance)();
            }
            getTrading().removeOpenMakeOrder(targetExchange, orderAddresses[i]);
            getTrading().returnAssetToVault(orderAddresses[i]);
            getAccounting().addAssetToOwnedAssets(orderAddresses[i]);
        }
    }

     /// @notice Minor: Wrapped tokens directly sent to the fund are not accounted. To be called by Trading spoke
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
        uint balance = WrapperLock(getWrapperTokenFromAdapterContext(makerAsset)).balanceOf(msg.sender);
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
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(makerAsset, makerQuantity);
        address wrappedToken = getWrapperToken(makerAsset);
        // Deposit to rounded up value of time difference of expiration time and current time (in hours)
        uint depositTime = (
            sub(orderExpirationTime, block.timestamp) / 1 hours
        ) + 1;

        // Handle case for WETH
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();
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

    /// @dev Function to be called from Trading spoke context (Delegate call)
    function getWrapperToken(address token)
        internal
        view
        returns (address wrapperToken)
    {
        address wrapperRegistry = Registry(Trading(address(this)).registry()).ethfinexWrapperRegistry();
        return WrapperRegistryEFX(wrapperRegistry).wrapper2TokenLookup(token);
    }

    /// @dev Function to be called by Trading spoke without change of context (Non delegate call)
    function getWrapperTokenFromAdapterContext(address token)
        internal
        view
        returns (address wrapperToken)
    {
        address wrapperRegistry = Registry(Trading(msg.sender).registry()).ethfinexWrapperRegistry();
        return WrapperRegistryEFX(wrapperRegistry).wrapper2TokenLookup(token);
    }
}
