pragma solidity ^0.4.21;


contract Trading is Spoke, TradingInterface {

    struct Exchange {
        address exchange;
        address adapter;
    }

    enum UpdateType { make, take, cancel }

    struct Order {
        address exchangeAddress;
        bytes32 orderId;
        UpdateType updateType;
        address makerAsset;
        address takerAsset;
        uint makerQuantity;
        uint takerQuantity;
        uint timestamp;
        uint fillTakerQuantity;
    }

    Exchange[] public exchanges;
    Order[] public orders;
    mapping (address => bool) public exchangeIsAdded;
    mapping (address => mapping(address => OpenMakeOrder)) public exchangesToOpenMakeOrders;

    function Trading(address[] _exchanges, address[] _adapters) {
        require(_exchanges.length == _adapters.length);
        for (uint i = 0; i < _exchanges.length; i++) {
            addExchange(_exchanges[i], _adapters[i]);
        }
    }

    // TODO: who can add exchanges? should they just be set at creation?
    function addExchange(address _exchange, address _adapter) internal {
        require(hub.canonicalRegistrar.exchangeIsRegistered(_exchange));
        require(!exchangeIsAdded[_exchange]);
        exchangeIsAdded[_exchange] = true;
        exchanges.push(Exchange(_exchange, _adapter));
    }

    function callOnExchange(
        uint exchangeIndex,
        bytes4 method,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        // isValidPolicyBySig(method, [orderAddresses[0], orderAddresses[1], orderAddresses[2], orderAddresses[3], exchanges[exchangeIndex].exchange], [orderValues[0], orderValues[1], orderValues[6]], identifier) 
    
    {
        require(hub.canonicalRegistrar.exchangeMethodIsAllowed(exchanges[exchangeIndex].exchange, method));
        address adapter = exchanges[exchangeIndex].adapter;
        address exchange = exchanges[exchangeIndex].exchange;
        require(adapter.delegatecall(
            method, exchange, orderAddresses, orderValues, identifier, v, r, s
        ));
    }

    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        uint orderId
    )
        pre_cond(msg.sender == address(this))
    {
        isInOpenMakeOrder[ofSellAsset] = true;
        exchangesToOpenMakeOrders[ofExchange][ofSellAsset].id = orderId;
        exchangesToOpenMakeOrders[ofExchange][ofSellAsset].expiresAt = add(now, ORDER_EXPIRATION_TIME);
    }

    function removeOpenMakeOrder(
        address ofExchange,
        address ofSellAsset
    )
        pre_cond(msg.sender == address(this))
    {
        delete exchangesToOpenMakeOrders[ofExchange][ofSellAsset];
    }

    function orderUpdateHook(
        address ofExchange,
        bytes32 orderId,
        UpdateType updateType,
        address[2] orderAddresses,
        uint[3] orderValues
    )
        pre_cond(msg.sender == address(this))
    {
        // only save make/take
        // TODO: change to more generic datastore when that shift is made generally
        if (updateType == UpdateType.make || updateType == UpdateType.take) {
            orders.push(Order({
                exchangeAddress: ofExchange,
                orderId: orderId,
                updateType: updateType,
                makerAsset: orderAddresses[0],
                takerAsset: orderAddresses[1],
                makerQuantity: orderValues[0],
                takerQuantity: orderValues[1],
                timestamp: block.timestamp,
                fillTakerQuantity: orderValues[2]
            }));
        }
    }

    function quantityHeldInCustodyOfExchange(address ofAsset) returns (uint) {
        uint totalSellQuantity;     // quantity in custody across exchanges
        uint totalSellQuantityInApprove; // quantity of asset in approve (allowance) but not custody of exchange
        for (uint i; i < exchanges.length; i++) {
            if (exchangesToOpenMakeOrders[exchanges[i].exchange][ofAsset].id == 0) {
                continue;
            }
            var (sellAsset, , sellQuantity, ) = GenericExchangeInterface(exchanges[i].exchangeAdapter).getOrder(exchanges[i].exchange, exchangesToOpenMakeOrders[exchanges[i].exchange][ofAsset].id);
            if (sellQuantity == 0) {    // remove id if remaining sell quantity zero (closed)
                delete exchangesToOpenMakeOrders[exchanges[i].exchange][ofAsset];
            }
            totalSellQuantity = add(totalSellQuantity, sellQuantity);
            if (!exchanges[i].takesCustody) {
                totalSellQuantityInApprove += sellQuantity;
            }
        }
        if (totalSellQuantity == 0) {
            isInOpenMakeOrder[sellAsset] = false;
        }
        return sub(totalSellQuantity, totalSellQuantityInApprove); // Since quantity in approve is not actually in custody
    }

    function returnToVault(ERC20[] _tokens) public {
        for (uint i = 0; i < _tokens.length; i++) {
            _tokens[i].transfer(hub.vault, _tokens[i].balanceOf(this));
        }
    }
}

