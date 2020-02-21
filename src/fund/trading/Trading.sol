pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/Spoke.sol";
import "../policies/IPolicyManager.sol";
import "../policies/TradingSignatures.sol";
import "../../dependencies/TokenUser.sol";
import "../../factory/Factory.sol";
import "../../version/IRegistry.sol";
import "../../exchanges/libs/ExchangeAdapter.sol";

contract Trading is TokenUser, Spoke, TradingSignatures {
    struct Exchange {
        address exchange;
        address adapter;
    }

    Exchange[] public exchanges;
    mapping (address => bool) public adapterIsAdded;

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
        for (uint256 i = 0; i < _exchanges.length; i++) {
            __addExchange(_exchanges[i], _adapters[i]);
        }
    }

    // EXTERNAL FUNCTIONS

    /// @notice Receive ether function (used to receive ETH from WETH)
    receive() external payable {}

    function addExchange(address _exchange, address _adapter) external auth {
        __addExchange(_exchange, _adapter);
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

    function withdraw(address _token, uint256 _amount) external auth {
        safeTransfer(_token, msg.sender, _amount);
    }

    // PUBLIC FUNCTIONS

    /// @notice Universal method for calling exchange functions through adapters
    /// @notice See decoder in adapters to know how to encode needed arguments for each exchange
    /// @notice rskMngAddrs [0] makerAddress
    /// @notice rskMngAddrs [1] takerAddress
    /// @notice rskMngAddrs [2] makerAsset
    /// @notice rskMngAddrs [3] takerAsset
    /// @notice rskMngAddrs [4] makerFeeAsset
    /// @notice rskMngAddrs [5] takerFeeAsset
    /// @notice rskMngVals [0] makerAssetAmount
    /// @notice rskMngVals [1] takerAssetAmount
    /// @notice rskMngVals [2] fillAmout
    /// @param _exchangeIndex Index of the exchange in the "exchanges" array
    /// @param _identifier Order identifier
    /// @param _encodedArgs Encoded arguments for a specific exchange
    function callOnExchange(
        uint256 _exchangeIndex,
        string memory _methodSignature,
        bytes32 _identifier,
        bytes memory _encodedArgs
    )
        public
        onlyInitialized
    {
        bytes4 methodSelector = bytes4(keccak256(bytes(_methodSignature)));
        (
            address[6] memory rskMngAddrs,
            uint256[3] memory rskMngVals
        ) = __getRiskManagementArgs(_exchangeIndex, _encodedArgs);
        address adapter = exchanges[_exchangeIndex].adapter;
        address targetExchange = exchanges[_exchangeIndex].exchange;

        __validateCallOnExchange(_exchangeIndex, methodSelector, rskMngAddrs);

        IPolicyManager(routes.policyManager).preValidate(
            methodSelector,
            [
                rskMngAddrs[0],
                rskMngAddrs[1],
                rskMngAddrs[2],
                rskMngAddrs[3],
                targetExchange
            ],
            rskMngVals,
            _identifier
        );

        (bool success, bytes memory returnData) = adapter.delegatecall(
            abi.encodeWithSignature(
                _methodSignature,
                targetExchange,
                _encodedArgs
            )
        );

        require(success, string(returnData));

        IPolicyManager(routes.policyManager).postValidate(
            methodSelector,
            [
                rskMngAddrs[0],
                rskMngAddrs[1],
                rskMngAddrs[2],
                rskMngAddrs[3],
                targetExchange
            ],
            rskMngVals,
            _identifier
        );
    }

    // INTERNAL FUNCTIONS

    function __addExchange(
        address _exchange,
        address _adapter
    ) internal {
        require(!adapterIsAdded[_adapter], "Adapter already added");
        adapterIsAdded[_adapter] = true;
        IRegistry registry = IRegistry(routes.registry);
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

    function __getRiskManagementArgs(
        uint256 _exchangeIndex,
        bytes memory _encodedArgs
    )
        internal
        returns (address[6] memory, uint256[3] memory)
    {
        address adapter = exchanges[_exchangeIndex].adapter;
        (bool success, bytes memory returnData) = adapter.delegatecall(
            abi.encodeWithSelector(
                ExchangeAdapter(adapter).extractRiskManagementArgs.selector,
                _encodedArgs
            )
        );
        require(success, "Encoded arguments might not match");
        return abi.decode(returnData, (address[6], uint256[3]));
    }

    function __validateCallOnExchange(
        uint256 _exchangeIndex,
        bytes4 _methodSelector,
        address[6] memory _rskMngAddrs
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
        IRegistry registry = IRegistry(routes.registry);
        require(
            registry.adapterMethodIsAllowed(
                exchanges[_exchangeIndex].adapter,
                _methodSelector
            ),
            "Adapter method not allowed"
        );

        if (_methodSelector == TAKE_ORDER) {
            require(registry.assetIsRegistered(
                _rskMngAddrs[0]), 'Maker asset not registered'
            );
            require(registry.assetIsRegistered(
                _rskMngAddrs[1]), 'Taker asset not registered'
            );
            if (_rskMngAddrs[5] != address(0)) {
                require(
                    registry.assetIsRegistered(_rskMngAddrs[5]),
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
    )
        public
        returns (address)
    {
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
