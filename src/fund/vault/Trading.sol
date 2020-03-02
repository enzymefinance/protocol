pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/SpokeAccessor.sol";
import "../policies/IPolicyManager.sol";
import "../policies/TradingSignatures.sol";
import "../../dependencies/DSAuth.sol";
import "../../version/IRegistry.sol";

contract Trading is DSAuth, SpokeAccessor, TradingSignatures {
    struct Exchange {
        address exchange;
        address adapter;
    }

    Exchange[] public exchanges;
    mapping (address => bool) public adapterIsAdded;

    constructor(address[] memory _exchanges, address[] memory _adapters, address _registry)
        public
    {
        require(_exchanges.length == _adapters.length, "Array lengths unequal");
        for (uint256 i = 0; i < _exchanges.length; i++) {
            __addExchange(_exchanges[i], _adapters[i], _registry);
        }
    }

    // EXTERNAL FUNCTIONS

    function addExchange(address _exchange, address _adapter) external auth {
        __addExchange(_exchange, _adapter, __getRoutes().registry);
    }

    function getExchangeInfo()
        external
        view
        returns (address[] memory, address[] memory)
    {
        address[] memory ofExchanges = new address[](exchanges.length);
        address[] memory ofAdapters = new address[](exchanges.length);
        for (uint256 i = 0; i < exchanges.length; i++) {
            ofExchanges[i] = exchanges[i].exchange;
            ofAdapters[i] = exchanges[i].adapter;
        }
        return (ofExchanges, ofAdapters);
    }

    // PUBLIC FUNCTIONS

    /// @notice Universal method for calling exchange functions through adapters
    /// @notice See adapter contracts for parameters needed for each exchange
    /// @param _exchangeIndex Index of the exchange in the "exchanges" array
    /// @param _orderAddresses [0] Order maker
    /// @param _orderAddresses [1] Order taker
    /// @param _orderAddresses [2] maker asset
    /// @param _orderAddresses [3] taker asset
    /// @param _orderAddresses [4] fee recipient
    /// @param _orderAddresses [5] sender address
    /// @param _orderAddresses [6] maker fee asset
    /// @param _orderAddresses [7] taker fee asset
    /// @param _orderValues [0] maker asset amount
    /// @param _orderValues [1] taker asset amount
    /// @param _orderValues [2] maker fee
    /// @param _orderValues [3] taker fee
    /// @param _orderValues [4] expiration time (seconds)
    /// @param _orderValues [5] Salt/nonce
    /// @param _orderValues [6] Fill amount: amount of taker token to be traded
    /// @param _orderValues [7] Dexy signature mode
    /// @param _orderData [0] Encoded data specific to maker asset
    /// @param _orderData [1] Encoded data specific to taker asset
    /// @param _orderData [2] Encoded data specific to maker asset fee
    /// @param _orderData [3] Encoded data specific to taker asset fee
    /// @param _identifier Order identifier
    /// @param _signature Signature of order maker
    function callOnExchange(
        uint256 _exchangeIndex,
        string memory _methodSignature,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        spokeInitialized
    {
        bytes4 methodSelector = bytes4(keccak256(bytes(_methodSignature)));
        __validateCallOnExchange(_exchangeIndex, methodSelector, _orderAddresses);

        IPolicyManager(__getRoutes().policyManager).preValidate(
            methodSelector,
            [
                _orderAddresses[0],
                _orderAddresses[1],
                _orderAddresses[2],
                _orderAddresses[3],
                exchanges[_exchangeIndex].exchange
            ],
            [
                _orderValues[0],
                _orderValues[1],
                _orderValues[6]
            ],
            _identifier
        );
        (bool success, bytes memory returnData) = exchanges[_exchangeIndex].adapter.delegatecall(
            abi.encodeWithSignature(
                _methodSignature,
                exchanges[_exchangeIndex].exchange,
                _orderAddresses,
                _orderValues,
                _orderData,
                _identifier,
                _signature
            )
        );
        require(success, string(returnData));
        IPolicyManager(__getRoutes().policyManager).postValidate(
            methodSelector,
            [
                _orderAddresses[0],
                _orderAddresses[1],
                _orderAddresses[2],
                _orderAddresses[3],
                exchanges[_exchangeIndex].exchange
            ],
            [
                _orderValues[0],
                _orderValues[1],
                _orderValues[6]
            ],
            _identifier
        );
    }

    // INTERNAL FUNCTIONS

    function __addExchange(address _exchange, address _adapter, address _registry) internal {
        require(!adapterIsAdded[_adapter], "Adapter already added");
        adapterIsAdded[_adapter] = true;
        IRegistry registry = IRegistry(_registry);
        require(
            registry.exchangeAdapterIsRegistered(_adapter),
            "Adapter is not registered"
        );
        require(
            registry.exchangeForAdapter(_adapter) == _exchange,
            "Exchange and adapter do not match"
        );
        exchanges.push(Exchange(_exchange, _adapter));
    }

    function __validateCallOnExchange(
        uint256 _exchangeIndex,
        bytes4 _methodSelector,
        address[8] memory _orderAddresses
    )
        private
        view
    {
        require(
            __getHub().manager() == msg.sender,
            "Manager must be sender"
        );
        require(
            !__getHub().isShutDown(),
            "Hub must not be shut down"
        );
        IRegistry registry = IRegistry(__getRoutes().registry);
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
