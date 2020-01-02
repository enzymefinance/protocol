pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/token/IERC20.sol";
import "../fund/trading/Trading.sol";
import "../fund/hub/Hub.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../version/Registry.sol";
import "../dependencies/WETH.sol";
import "../dependencies/DSMath.sol";
import "./interfaces/IZeroExV2.sol";
import "./interfaces/IEthfinex.sol";
import "./ExchangeAdapter.sol";

/// @title EthfinexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to EthFinex exchange
contract EthfinexAdapter is DSMath, ExchangeAdapter {

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order by pre-approving signatures
    function makeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override onlyManager notShutDown {
        ensureCanMakeOrder(orderAddresses[2]);
        Hub hub = getHub();
        IZeroExV2.Order memory order = constructOrderStruct(orderAddresses, orderValues, orderData);
        bytes memory wrappedMakerAssetData = orderData[0];
        bytes memory takerAssetData = orderData[1];
        address makerAsset = orderAddresses[2];
        address takerAsset = getAssetAddress(takerAssetData);
        require(
            takerAsset == orderAddresses[3],
            "Taker asset data does not match order address in array"
        );
        // Order parameter checks
        getTrading().updateAndGetQuantityBeingTraded(makerAsset);
        ensureNotInOpenMakeOrder(makerAsset);

        wrapMakerAsset(targetExchange, makerAsset, wrappedMakerAssetData, order.makerAssetAmount, order.expirationTimeSeconds);
        IZeroExV2.OrderInfo memory orderInfo = IZeroExV2(targetExchange).getOrderInfo(order);
        IZeroExV2(targetExchange).preSign(orderInfo.orderHash, address(this), signature);

        require(
            IZeroExV2(targetExchange).isValidSignature(
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
            [payable(makerAsset), payable(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, uint(0)]
        );
        getTrading().addOpenMakeOrder(
            targetExchange,
            makerAsset,
            takerAsset,
            uint256(orderInfo.orderHash),
            order.expirationTimeSeconds
        );
        getTrading().addZeroExV2OrderData(orderInfo.orderHash, order);
    }

    /// @notice Cancel the 0x make order
    function cancelOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override onlyCancelPermitted(targetExchange, orderAddresses[2]) {
        Hub hub = getHub();

        IZeroExV2.Order memory order = getTrading().getZeroExV2OrderDetails(identifier);
        IZeroExV2(targetExchange).cancelOrder(order);

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
    /// @dev Call to "withdraw" fails if timestamp < `Wrapper.depositLock(tradingComponent)`
    function withdrawTokens(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public {
        Hub hub = getHub();
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();

        for (uint i = 0; i < orderAddresses.length; i++) {
            if (orderAddresses[i] == address(0)) continue;
            address wrappedToken = getWrapperToken(orderAddresses[i]);
            uint balance = IWrapperLock(wrappedToken).balanceOf(address(this));
            require(balance > 0, "Insufficient balance");
            IWrapperLock(wrappedToken).withdraw(balance, 0, bytes32(0), bytes32(0), 0);
            if (orderAddresses[i] == nativeAsset) {
                WETH(payable(nativeAsset)).deposit.value(balance)();
            }
            getTrading().removeOpenMakeOrder(targetExchange, orderAddresses[i]);
            getTrading().returnAssetToVault(orderAddresses[i]);
        }
    }

     /// @notice Minor: Wrapped tokens directly sent to the fund are not accounted. To be called by Trading spoke
    function getOrder(address targetExchange, uint256 id, address makerAsset)
        public
        view
        override
        returns (address, address, uint256, uint256)
    {
        uint orderId;
        uint orderIndex;
        address takerAsset;
        uint makerQuantity;
        uint takerQuantity;
        (orderId, , orderIndex) = Trading(msg.sender).getOpenOrderInfo(targetExchange, makerAsset);
        (, takerAsset, makerQuantity, takerQuantity) = Trading(msg.sender).getOrderDetails(orderIndex);

        // Check if order has been completely filled
        uint takerAssetFilledAmount = IZeroExV2(targetExchange).filled(bytes32(orderId));
        if (sub(takerQuantity, takerAssetFilledAmount) == 0) {
            return (makerAsset, takerAsset, 0, 0);
        }

        // Check if tokens have been withdrawn (cancelled order may still need to be accounted if there is balance)
        uint balance = IWrapperLock(getWrapperTokenFromAdapterContext(makerAsset)).balanceOf(msg.sender);
        if (balance == 0) {
            return (makerAsset, takerAsset, 0, 0);
        }
        return (makerAsset, takerAsset, makerQuantity, sub(takerQuantity, takerAssetFilledAmount));
    }

    // INTERNAL METHODS

    /// @notice needed to avoid stack too deep error
    /// @dev deposit time should be greater than 1 hour
    function wrapMakerAsset(address targetExchange, address makerAsset, bytes memory wrappedMakerAssetData, uint makerQuantity, uint orderExpirationTime)
        internal
    {
        Hub hub = getHub();
        Vault vault = Vault(hub.vault());
        vault.withdraw(makerAsset, makerQuantity);
        address wrappedToken = getWrapperToken(makerAsset);
        require(
            wrappedToken == getAssetAddress(wrappedMakerAssetData),
            "Wrapped maker asset data does not match order address in array"
        );
        // Deposit to rounded up value of time difference of expiration time and current time (in hours)
        uint depositTime = (
            sub(orderExpirationTime, block.timestamp) / 1 hours
        ) + 1;

        // Handle case for WETH
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();
        if (makerAsset == nativeAsset) {
            WETH(payable(nativeAsset)).withdraw(makerQuantity);
            IWrapperLockEth(wrappedToken).deposit.value(makerQuantity)(makerQuantity, depositTime);
        } else {
            IERC20(makerAsset).approve(wrappedToken, makerQuantity);
            IWrapperLock(wrappedToken).deposit(makerQuantity, depositTime);
        }
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

    /// @dev Function to be called from Trading spoke context (Delegate call)
    function getWrapperToken(address token)
        internal
        view
        returns (address wrapperToken)
    {
        address wrapperRegistry = Registry(getTrading().registry()).ethfinexWrapperRegistry();
        return IWrapperRegistryEFX(wrapperRegistry).token2WrapperLookup(token);
    }

    /// @dev Function to be called by Trading spoke without change of context (Non delegate call)
    function getWrapperTokenFromAdapterContext(address token)
        internal
        view
        returns (address wrapperToken)
    {
        address wrapperRegistry = Registry(Trading(msg.sender).registry()).ethfinexWrapperRegistry();
        return IWrapperRegistryEFX(wrapperRegistry).token2WrapperLookup(token);
    }
}
