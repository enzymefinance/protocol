pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;


import "./Trading.i.sol";
import "../hub/Spoke.sol";
import "../vault/Vault.sol";
import "../policies/Manager.sol";
import "../../dependencies/token/ERC20.i.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";
import "../../exchanges/GenericExchangeInterface.sol";
import "../../exchanges/thirdparty/0x/LibOrder.sol";
import "../../prices/CanonicalRegistrar.sol";

contract Trading is DSMath, Spoke, TradingInterface {

    struct Exchange {
        address exchange;
        address adapter;
        bool takesCustody;
    }

    enum UpdateType { make, take, cancel, swap }

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
        uint orderIndex; // Index of the order in the orders array
    }

    Exchange[] public exchanges;
    Order[] public orders;
    mapping (address => bool) public exchangeIsAdded;
    mapping (address => mapping(address => OpenMakeOrder)) public exchangesToOpenMakeOrders;
    mapping (address => bool) public isInOpenMakeOrder;
    mapping (bytes32 => LibOrder.Order) public orderIdToZeroExOrder;

    uint public constant ORDER_LIFESPAN = 1 days;

    modifier delegateInternal() {
        require(msg.sender == address(this), "Sender is not this contract");
        _;
    }

    constructor(
        address _hub,
        address[] _exchanges,
        address[] _adapters,
        bool[] _takesCustody
    ) Spoke(_hub) {
        require(_exchanges.length == _adapters.length, "Array lengths unequal");
        require(_exchanges.length == _takesCustody.length, "Array lengths unequal");
        for (uint i = 0; i < _exchanges.length; i++) {
            addExchange(_exchanges[i], _adapters[i], _takesCustody[i]);
        }
    }

    // TODO: who can add exchanges? should they just be set at creation?
    function addExchange(address _exchange, address _adapter, bool _takesCustody) internal {
        // require(CanonicalRegistrar(routes.canonicalRegistrar).exchangeIsRegistered(_exchange));
        require(!exchangeIsAdded[_exchange], "Exchange already added");
        exchangeIsAdded[_exchange] = true;
        exchanges.push(Exchange(_exchange, _adapter, _takesCustody));
    }

    /// @notice Universal method for calling exchange functions through adapters
    /// @notice See adapter contracts for parameters needed for each exchange
    /// @param exchangeIndex Index of the exchange in the "exchanges" array
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
    /// @param signature Signature of order maker.
    function callOnExchange(
        uint exchangeIndex,
        string methodSignature,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    )
        public
    {
        // require(
        //     modules.pricefeed.exchangeMethodIsAllowed(
        //         exchanges[exchangeIndex].exchange, bytes4(keccak256(methodSignature))
        //     )
        // );
        PolicyManager(routes.policyManager).preValidate(bytes4(keccak256(methodSignature)), [orderAddresses[0], orderAddresses[1], orderAddresses[2], orderAddresses[3], exchanges[exchangeIndex].exchange], [orderValues[0], orderValues[1], orderValues[6]], identifier);
        // require(bytes4(hex'79705be7') == bytes4(keccak256(methodSignature)));
        // require(
        //     exchanges[exchangeIndex].adapter.delegatecall(
        //         hex'79705be7',
        //         // bytes4(keccak256(methodSignature)),
        //         exchanges[exchangeIndex].exchange,
        //         orderAddresses,
        //         orderValues,
        //         identifier,
        //         makerAssetData,
        //         takerAssetData,
        //         signature
        // ));

        require(
            exchanges[exchangeIndex].adapter.delegatecall(
                abi.encodeWithSignature(
                    methodSignature,
                    exchanges[exchangeIndex].exchange,
                    orderAddresses,
                    orderValues,
                    identifier,
                    makerAssetData,
                    takerAssetData,
                    signature
                )
            ),
            "Delegated call to exchange failed"
        );
        // PolicyManager(routes.policyManager).postValidate(bytes4(keccak256(methodSignature)), [orderAddresses[0], orderAddresses[1], orderAddresses[2], orderAddresses[3], exchanges[exchangeIndex].exchange], [orderValues[0], orderValues[1], orderValues[6]], identifier);
    }

    /// @dev Make sure this is called after orderUpdateHook in adapters
    function addOpenMakeOrder(
        address ofExchange,
        address ofSellAsset,
        uint orderId
    ) delegateInternal {
        require(!isInOpenMakeOrder[ofSellAsset], "Sell asset already in open order");
        require(orders.length > 0, "No orders in array");
        isInOpenMakeOrder[ofSellAsset] = true;
        exchangesToOpenMakeOrders[ofExchange][ofSellAsset].id = orderId;
        exchangesToOpenMakeOrders[ofExchange][ofSellAsset].expiresAt = add(block.timestamp, ORDER_LIFESPAN);
        exchangesToOpenMakeOrders[ofExchange][ofSellAsset].orderIndex = sub(orders.length, 1);
    }
    
    function removeOpenMakeOrder(
        address ofExchange,
        address ofSellAsset
    ) delegateInternal {
        delete exchangesToOpenMakeOrders[ofExchange][ofSellAsset];
    }

    /// @dev Bit of Redundancy for now
    function addZeroExOrderData(
        bytes32 orderId,
        LibOrder.Order zeroExOrderData
    ) delegateInternal {
        orderIdToZeroExOrder[orderId] = zeroExOrderData;
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
            (sellAsset, , sellQuantity, ) = GenericExchangeInterface(exchanges[i].adapter).getOrder(exchanges[i].exchange, exchangesToOpenMakeOrders[exchanges[i].exchange][ofAsset].id, ofAsset);
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

    /// @notice Payable function to get back ETH from WETH
    function() public payable { }

    function getExchangeInfo() view returns (address[], address[], bool[]) {
        address[] memory ofExchanges = new address[](exchanges.length);
        address[] memory ofAdapters = new address[](exchanges.length);
        bool[] memory takesCustody = new bool[](exchanges.length);
        for (uint i = 0; i < exchanges.length; i++) {
            ofExchanges[i] = exchanges[i].exchange;
            ofAdapters[i] = exchanges[i].adapter;
            takesCustody[i] = exchanges[i].takesCustody;
        }
        return (ofExchanges, ofAdapters, takesCustody);
    }

    function getOpenOrderInfo(address ofExchange, address ofAsset) view returns (uint, uint, uint) {
        OpenMakeOrder order = exchangesToOpenMakeOrders[ofExchange][ofAsset];
        return (order.id, order.expiresAt, order.orderIndex);
    }

    function getOrderDetails(uint orderIndex) view returns (address, address, uint, uint) {
        Order memory order = orders[orderIndex];
        return (order.makerAsset, order.takerAsset, order.makerQuantity, order.takerQuantity);
    }

    function getZeroExOrderDetails(bytes32 orderId) view returns (LibOrder.Order) {
        return orderIdToZeroExOrder[orderId];
    }
}

contract TradingFactory is Factory {
    function createInstance(address _hub, address[] _exchanges, address[] _adapters, bool[] _takesCustody) public returns (address) {
        address trading = new Trading(_hub, _exchanges, _adapters, _takesCustody);
        childExists[trading] = true;
        return trading;
    }
}

