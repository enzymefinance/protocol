pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/Spoke.sol";
import "../policies/PolicyManager.sol";
import "../policies/TradingSignatures.sol";
import "../../factory/Factory.sol";
import "../../dependencies/DSMath.sol";
import "../../exchanges/ExchangeAdapter.sol";
import "../../exchanges/interfaces/IZeroExV2.sol";
import "../../exchanges/interfaces/IZeroExV3.sol";
import "../../version/Registry.sol";
import "../../dependencies/TokenUser.sol";

contract Trading is DSMath, TokenUser, Spoke, TradingSignatures {
    event ExchangeMethodCall(
        address indexed exchangeAddress,
        string indexed methodSignature,
        address[8] orderAddresses,
        uint[8] orderValues,
        bytes[4] orderData,
        bytes32 identifier,
        bytes signature
    );

    struct Exchange {
        address exchange;
        address adapter;
        bool takesCustody;
    }

    Exchange[] public exchanges;
    mapping (address => bool) public adapterIsAdded;

    modifier delegateInternal() {
        require(msg.sender == address(this), "Sender is not this contract");
        _;
    }

    constructor(
        address _hub,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _registry
    )
        public
        Spoke(_hub)
    {
        routes.registry = _registry;
        require(_exchanges.length == _adapters.length, "Array lengths unequal");
        for (uint i = 0; i < _exchanges.length; i++) {
            _addExchange(_exchanges[i], _adapters[i]);
        }
    }

    /// @notice Receive ether function (used to receive ETH from WETH)
    receive() external payable {}

    function addExchange(address _exchange, address _adapter) external auth {
        _addExchange(_exchange, _adapter);
    }

    function withdraw(address _token, uint _amount) external auth {
        safeTransfer(_token, msg.sender, _amount);
    }

    function _addExchange(
        address _exchange,
        address _adapter
    ) internal {
        require(!adapterIsAdded[_adapter], "Adapter already added");
        adapterIsAdded[_adapter] = true;
        Registry registry = Registry(routes.registry);
        require(
            registry.exchangeAdapterIsRegistered(_adapter),
            "Adapter is not registered"
        );

        address registeredExchange;
        bool takesCustody;
        (registeredExchange, takesCustody) = registry.getExchangeInformation(_adapter);

        require(
            registeredExchange == _exchange,
            "Exchange and adapter do not match"
        );
        exchanges.push(Exchange(_exchange, _adapter, takesCustody));
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
    /// @param orderAddresses [6] maker fee asset
    /// @param orderAddresses [7] taker fee asset
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
    /// @param signature Signature of order maker
    function callOnExchange(
        uint exchangeIndex,
        string memory methodSignature,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    )
        public
        onlyInitialized
    {
        bytes4 methodSelector = bytes4(keccak256(bytes(methodSignature)));
        validateCallOnExchange(exchangeIndex, methodSelector, orderAddresses);

        PolicyManager(routes.policyManager).preValidate(methodSelector, [orderAddresses[0], orderAddresses[1], orderAddresses[2], orderAddresses[3], exchanges[exchangeIndex].exchange], [orderValues[0], orderValues[1], orderValues[6]], identifier);
        (bool success, bytes memory returnData) = exchanges[exchangeIndex].adapter.delegatecall(
            abi.encodeWithSignature(
                methodSignature,
                exchanges[exchangeIndex].exchange,
                orderAddresses,
                orderValues,
                orderData,
                identifier,
                signature
            )
        );
        require(success, string(returnData));
        PolicyManager(routes.policyManager).postValidate(methodSelector, [orderAddresses[0], orderAddresses[1], orderAddresses[2], orderAddresses[3], exchanges[exchangeIndex].exchange], [orderValues[0], orderValues[1], orderValues[6]], identifier);
        emit ExchangeMethodCall(
            exchanges[exchangeIndex].exchange,
            methodSignature,
            orderAddresses,
            orderValues,
            orderData,
            identifier,
            signature
        );
    }

    function getExchangeInfo() public view returns (address[] memory, address[] memory, bool[] memory) {
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

    function validateCallOnExchange(
        uint256 _exchangeIndex,
        bytes4 _methodSelector,
        address[8] memory _orderAddresses
    )
        internal
        view
    {
        require(
            hub.manager() == msg.sender,
            "Manager must be sender"
        );
        require(
            !hub.isShutDown(),
            "Hub must not be shut down"
        );
        Registry registry = Registry(routes.registry);
        require(
            registry.adapterMethodIsAllowed(
                exchanges[_exchangeIndex].adapter,
                _methodSelector
            ),
            "Adapter method not allowed"
        );

        if (_methodSelector == TAKE_ORDER) {
            require(registry.assetIsRegistered(
                _orderAddresses[2]), 'Maker asset not registered'
            );
            require(registry.assetIsRegistered(
                _orderAddresses[3]), 'Taker asset not registered'
            );
            if (_orderAddresses[7] != address(0)) {
                require(
                    registry.assetIsRegistered(_orderAddresses[7]),
                    'Taker fee asset not registered'
                );
            }
        }
    }
}

contract TradingFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address[] exchanges,
        address[] adapters,
        address registry
    );

    function createInstance(
        address _hub,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _registry
    ) public returns (address) {
        address trading = address(new Trading(_hub, _exchanges, _adapters, _registry));
        childExists[trading] = true;
        emit NewInstance(
            _hub,
            trading,
            _exchanges,
            _adapters,
            _registry
        );
        return trading;
    }
}
