pragma solidity ^0.4.21;


import "./Trading.i.sol";
import "../hub/Spoke.sol";
import "../vault/Vault.sol";
import "../policies/Manager.sol";
import "../../dependencies/token/ERC20.i.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";
import "../../exchanges/GenericExchangeInterface.sol";
import "../../prices/CanonicalRegistrar.sol";

contract Trading is DSMath, Spoke, TradingInterface {

    struct Exchange {
        address exchange;
        address adapter;
        bool takesCustody;
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

    struct OpenMakeOrder {
        uint id; // Order Id from exchange
        uint expiresAt; // Timestamp when the order expires
    }

    Exchange[] public exchanges;
    Order[] public orders;
    mapping (address => bool) public exchangeIsAdded;
    mapping (address => mapping(address => OpenMakeOrder)) public exchangesToOpenMakeOrders;
    mapping (address => bool) public isInOpenMakeOrder;

    uint public constant ORDER_LIFESPAN = 1 days;

    modifier delegateInternal() {
        require(msg.sender == address(this));
        _;
    }

    constructor(
        address _hub,
        address[] _exchanges,
        address[] _adapters,
        bool[] _takesCustody
    ) Spoke(_hub) {
        require(_exchanges.length == _adapters.length);
        require(_exchanges.length == _takesCustody.length);
        for (uint i = 0; i < _exchanges.length; i++) {
            addExchange(_exchanges[i], _adapters[i], _takesCustody[i]);
        }
    }

    // TODO: who can add exchanges? should they just be set at creation?
    function addExchange(address _exchange, address _adapter, bool _takesCustody) internal {
        // require(CanonicalRegistrar(routes.canonicalRegistrar).exchangeIsRegistered(_exchange));
        require(!exchangeIsAdded[_exchange]);
        exchangeIsAdded[_exchange] = true;
        exchanges.push(Exchange(_exchange, _adapter, _takesCustody));
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
    {
        PolicyManager(routes.policyManager).preValidate(method, [orderAddresses[0], orderAddresses[1], orderAddresses[2], orderAddresses[3], exchanges[exchangeIndex].exchange], [orderValues[0], orderValues[1], orderValues[6]], identifier);
        // require(CanonicalRegistrar(routes.canonicalRegistrar).exchangeMethodIsAllowed(exchanges[exchangeIndex].exchange, method));
        address adapter = exchanges[exchangeIndex].adapter;
        address exchange = exchanges[exchangeIndex].exchange;
        require(adapter.delegatecall(
            method, exchange, orderAddresses, orderValues, identifier, v, r, s
        ));
        PolicyManager(routes.policyManager).postValidate(method, [orderAddresses[0], orderAddresses[1], orderAddresses[2], orderAddresses[3], exchanges[exchangeIndex].exchange], [orderValues[0], orderValues[1], orderValues[6]], identifier);
    }

    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        uint orderId
    ) delegateInternal {
        require(!isInOpenMakeOrder[ofSellAsset]);
        isInOpenMakeOrder[ofSellAsset] = true;
        exchangesToOpenMakeOrders[ofExchange][ofSellAsset].id = orderId;
        exchangesToOpenMakeOrders[ofExchange][ofSellAsset].expiresAt = add(block.timestamp, ORDER_LIFESPAN);
    }

    function removeOpenMakeOrder(
        address ofExchange,
        address ofSellAsset
    ) delegateInternal {
        delete exchangesToOpenMakeOrders[ofExchange][ofSellAsset];
    }

    function orderUpdateHook(
        address ofExchange,
        bytes32 orderId,
        UpdateType updateType,
        address[2] orderAddresses,
        uint[3] orderValues
    ) delegateInternal {
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

    function updateAndGetQuantityBeingTraded(address _asset) returns (uint) {
        uint quantityHere = ERC20(_asset).balanceOf(this);
        return add(updateAndGetQuantityHeldInExchange(_asset), quantityHere);
    }

    function updateAndGetQuantityHeldInExchange(address ofAsset) returns (uint) {
        uint totalSellQuantity; // quantity in custody across exchanges
        uint totalSellQuantityInApprove; // quantity of asset in approve (allowance) but not custody of exchange
        for (uint i; i < exchanges.length; i++) {
            if (exchangesToOpenMakeOrders[exchanges[i].exchange][ofAsset].id == 0) {
                continue;
            }
            address sellAsset;
            uint sellQuantity;
            (sellAsset, , sellQuantity, ) = GenericExchangeInterface(exchanges[i].adapter).getOrder(exchanges[i].exchange, exchangesToOpenMakeOrders[exchanges[i].exchange][ofAsset].id);
            if (sellQuantity == 0) {    // remove id if remaining sell quantity zero (closed)
                delete exchangesToOpenMakeOrders[exchanges[i].exchange][ofAsset];
            }
            totalSellQuantity = add(totalSellQuantity, sellQuantity);
            if (!exchanges[i].takesCustody) {
                totalSellQuantityInApprove += sellQuantity;
            }
        }
        if (totalSellQuantity == 0) {
            isInOpenMakeOrder[ofAsset] = false;
        }
        return sub(totalSellQuantity, totalSellQuantityInApprove); // Since quantity in approve is not actually in custody
    }

    function returnToVault(ERC20[] _tokens) public {
        for (uint i = 0; i < _tokens.length; i++) {
            _tokens[i].transfer(Vault(routes.vault), _tokens[i].balanceOf(this));
        }
    }
}

contract TradingFactory is Factory {
    function createInstance(address _hub, address[] _exchanges, address[] _adapters, bool[] _takesCustody) public returns (address) {
        address trading = new Trading(_hub, _exchanges, _adapters, _takesCustody);
        childExists[trading] = true;
        return trading;
    }
}

