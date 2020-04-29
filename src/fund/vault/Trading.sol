pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSAuth.sol";
import "../../registry/IRegistry.sol";
import "../hub/SpokeAccessor.sol";
import "../policies/IPolicyManager.sol";
import "../policies/TradingSignatures.sol";
import "../../exchanges/libs/ExchangeAdapter.sol";
import "../../exchanges/libs/OrderTaker.sol";

/// @title Trading Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages and interacts with exchanges
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
    /// @notice See decoder in adapters to know how to encode needed arguments for each exchange
    /// @param _exchangeIndex Index of the exchange in the "exchanges" array
    /// @param _encodedArgs Encoded arguments for a specific exchange
    function callOnExchange(
        uint256 _exchangeIndex,
        string memory _methodSignature,
        bytes memory _encodedArgs
    )
        public
        spokeInitialized
    {
        bytes4 methodSelector = bytes4(keccak256(bytes(_methodSignature)));

        __validateCallOnExchange(_exchangeIndex, methodSelector);

        (bool success, bytes memory returnData) = exchanges[_exchangeIndex].adapter.delegatecall(
            abi.encodeWithSignature(
                _methodSignature,
                exchanges[_exchangeIndex].exchange,
                _encodedArgs
            )
        );

        require(success, string(returnData));
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
        bytes4 _methodSelector
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
    }
}
