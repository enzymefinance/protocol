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
    /// @param _orderAddresses [2] Order maker asset
    /// @param _orderAddresses [3] Order taker asset
    /// @param _orderData [0] Encoded data specific to maker asset
    /// @param _orderData [1] Encoded data specific to taker asset
    modifier orderAddressesMatchOrderData(
        address[8] memory _orderAddresses,
        bytes[4] memory _orderData
    )
    {
        require(
            getAssetAddress(_orderData[0]) == getWrapperToken(_orderAddresses[2]),
            "Maker asset data does not match order address in array"
        );
        require(
            getAssetAddress(_orderData[1]) == _orderAddresses[3],
            "Taker asset data does not match order address in array"
        );
        _;
    }

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order by pre-approving signatures
    function makeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
        onlyManager
        notShutDown
        orderAddressesMatchOrderData(_orderAddresses, _orderData)
    {
        ensureCanMakeOrder(_orderAddresses[2]);

        IZeroExV2.Order memory order = constructOrderStruct(_orderAddresses, _orderValues, _orderData);
        bytes memory wrappedMakerAssetData = _orderData[0];
        bytes memory takerAssetData = _orderData[1];
        address makerAsset = _orderAddresses[2];
        address takerAsset = getAssetAddress(takerAssetData);

        // Order parameter checks
        getTrading().updateAndGetQuantityBeingTraded(makerAsset);
        ensureNotInOpenMakeOrder(makerAsset);

        wrapMakerAsset(_targetExchange, makerAsset, wrappedMakerAssetData, order.makerAssetAmount, order.expirationTimeSeconds);

        IZeroExV2.OrderInfo memory orderInfo = IZeroExV2(_targetExchange).getOrderInfo(order);
        IZeroExV2(_targetExchange).preSign(orderInfo.orderHash, address(this), _signature);

        require(
            IZeroExV2(_targetExchange).isValidSignature(
                orderInfo.orderHash,
                address(this),
                _signature
            ),
            "INVALID_ORDER_SIGNATURE"
        );

        updateStateMakeOrder(_targetExchange, order);
    }

    /// @notice Cancel the 0x make order
    function cancelOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
        orderAddressesMatchOrderData(_orderAddresses, _orderData)
    {
        IZeroExV2.Order memory order = getTrading().getZeroExV2OrderDetails(_identifier);
        ensureCancelPermitted(_targetExchange, _orderAddresses[2], _identifier);
        IZeroExV2(_targetExchange).cancelOrder(order);

        updateStateCancelOrder(_targetExchange, order);
    }

    /// @notice Unwrap (withdraw) tokens, uses _orderAddresses for input list of tokens to be unwrapped
    /// @dev Call to "withdraw" fails if timestamp < `Wrapper.depositLock(tradingComponent)`
    function withdrawTokens(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
    {
        Hub hub = getHub();
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();

        for (uint i = 0; i < _orderAddresses.length; i++) {
            if (_orderAddresses[i] == address(0)) continue;
            address wrappedToken = getWrapperToken(_orderAddresses[i]);
            uint balance = IWrapperLock(wrappedToken).balanceOf(address(this));
            require(balance > 0, "Insufficient balance");
            IWrapperLock(wrappedToken).withdraw(balance, 0, bytes32(0), bytes32(0), 0);
            if (_orderAddresses[i] == nativeAsset) {
                WETH(payable(nativeAsset)).deposit.value(balance)();
            }
            getTrading().removeOpenMakeOrder(_targetExchange, _orderAddresses[i]);
            getTrading().returnAssetToVault(_orderAddresses[i]);
        }
    }

     /// @notice Minor: Wrapped tokens directly sent to the fund are not accounted. To be called by Trading spoke
    function getOrder(address _targetExchange, uint256 _id, address _makerAsset)
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
        (orderId, , orderIndex) = Trading(msg.sender).getOpenOrderInfo(_targetExchange, _makerAsset);
        (, takerAsset, makerQuantity, takerQuantity) = Trading(msg.sender).getOrderDetails(orderIndex);

        // Check if order has been completely filled
        uint takerAssetFilledAmount = IZeroExV2(_targetExchange).filled(bytes32(orderId));
        if (sub(takerQuantity, takerAssetFilledAmount) == 0) {
            return (_makerAsset, takerAsset, 0, 0);
        }

        // Check if tokens have been withdrawn (cancelled order may still need to be accounted if there is balance)
        uint balance = IWrapperLock(getWrapperTokenFromAdapterContext(_makerAsset)).balanceOf(msg.sender);
        if (balance == 0) {
            return (_makerAsset, takerAsset, 0, 0);
        }
        return (_makerAsset, takerAsset, makerQuantity, sub(takerQuantity, takerAssetFilledAmount));
    }

    // INTERNAL METHODS

    /// @notice needed to avoid stack too deep error
    /// @dev deposit time should be greater than 1 hour
    function wrapMakerAsset(
        address _targetExchange,
        address _makerAsset,
        bytes memory _wrappedMakerAssetData,
        uint _makerQuantity,
        uint _orderExpirationTime
    )
        internal
    {
        Hub hub = getHub();

        // Deposit to rounded up value of time difference of expiration time and current time (in hours)
        uint depositTime = (
            sub(_orderExpirationTime, block.timestamp) / 1 hours
        ) + 1;

        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();
        address wrappedToken = getWrapperToken(_makerAsset);
        // Handle case for WETH vs ERC20
        if (_makerAsset == nativeAsset) {
            Vault vault = Vault(hub.vault());
            vault.withdraw(_makerAsset, _makerQuantity);
            WETH(payable(nativeAsset)).withdraw(_makerQuantity);
            IWrapperLockEth(wrappedToken).deposit.value(_makerQuantity)(_makerQuantity, depositTime);
        } else {
            approveAsset(
                _makerAsset,
                wrappedToken,
                _makerQuantity,
                "makerAsset"
            );
            IWrapperLock(wrappedToken).deposit(_makerQuantity, depositTime);
        }
    }

    // @dev avoids stack too deep error
    function updateStateCancelOrder(address _targetExchange, IZeroExV2.Order memory _order)
        internal
    {
        // Order is not removed from OpenMakeOrder mapping as it's needed for accounting (wrapped tokens)
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            _targetExchange,
            IZeroExV2(_targetExchange).getOrderInfo(_order).orderHash,
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // @dev avoids stack too deep error
    function updateStateMakeOrder(address _targetExchange, IZeroExV2.Order memory _order)
        internal
    {
        address wrapperRegistry = Registry(getTrading().registry()).ethfinexWrapperRegistry();
        address wrappedMakerAsset = getAssetAddress(_order.makerAssetData);
        address makerAsset = IWrapperRegistryEFX(
            wrapperRegistry
        ).wrapper2TokenLookup(wrappedMakerAsset);
        address takerAsset = getAssetAddress(_order.takerAssetData);
        IZeroExV2.OrderInfo memory orderInfo = IZeroExV2(_targetExchange).getOrderInfo(_order);

        getAccounting().addAssetToOwnedAssets(takerAsset);
        getTrading().orderUpdateHook(
            _targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.make,
            [payable(makerAsset), payable(takerAsset)],
            [_order.makerAssetAmount, _order.takerAssetAmount, uint(0)]
        );
        getTrading().addOpenMakeOrder(
            _targetExchange,
            makerAsset,
            takerAsset,
            address(0),
            uint256(orderInfo.orderHash),
            _order.expirationTimeSeconds
        );
        getTrading().addZeroExV2OrderData(orderInfo.orderHash, _order);
    }

    // VIEW METHODS

    function constructOrderStruct(
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData
    )
        internal
        view
        returns (IZeroExV2.Order memory _order)
    {
        _order = IZeroExV2.Order({
            makerAddress: _orderAddresses[0],
            takerAddress: _orderAddresses[1],
            feeRecipientAddress: _orderAddresses[4],
            senderAddress: _orderAddresses[5],
            makerAssetAmount: _orderValues[0],
            takerAssetAmount: _orderValues[1],
            makerFee: _orderValues[2],
            takerFee: _orderValues[3],
            expirationTimeSeconds: _orderValues[4],
            salt: _orderValues[5],
            makerAssetData: _orderData[0],
            takerAssetData: _orderData[1]
        });
    }

    function getAssetProxy(address _targetExchange, bytes memory _assetData)
        internal
        view
        returns (address assetProxy_)
    {
        bytes4 assetProxyId;
        assembly {
            assetProxyId := and(mload(
                add(_assetData, 32)),
                0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }
        assetProxy_ = IZeroExV2(_targetExchange).getAssetProxy(assetProxyId);
    }

    function getAssetAddress(bytes memory _assetData)
        internal
        view
        returns (address assetAddress_)
    {
        assembly {
            assetAddress_ := mload(add(_assetData, 36))
        }
    }

    /// @dev Function to be called from Trading spoke context (Delegate call)
    function getWrapperToken(address _token)
        internal
        view
        returns (address)
    {
        address wrapperRegistry = Registry(getTrading().registry()).ethfinexWrapperRegistry();
        return IWrapperRegistryEFX(wrapperRegistry).token2WrapperLookup(_token);
    }

    /// @dev Function to be called by Trading spoke without change of context (Non delegate call)
    function getWrapperTokenFromAdapterContext(address _token)
        internal
        view
        returns (address)
    {
        address wrapperRegistry = Registry(Trading(msg.sender).registry()).ethfinexWrapperRegistry();
        return IWrapperRegistryEFX(wrapperRegistry).token2WrapperLookup(_token);
    }
}
