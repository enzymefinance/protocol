pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSAuth.sol";
import "../../registry/IRegistry.sol";
import "../hub/SpokeAccessor.sol";
import "../policies/IPolicyManager.sol";
import "../policies/TradingSignatures.sol";
import "../../version/IRegistry.sol";
import "../../exchanges/libs/ExchangeAdapter.sol";
import "../../exchanges/libs/OrderTaker.sol";

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
    /// - rskMngAddrs [0] makerAddress
    /// - rskMngAddrs [1] takerAddress
    /// - rskMngAddrs [2] makerAsset
    /// - rskMngAddrs [3] takerAsset
    /// - rskMngAddrs [4] makerFeeAsset
    /// - rskMngAddrs [5] takerFeeAsset
    /// - rskMngVals [0] makerAssetAmount
    /// - rskMngVals [1] takerAssetAmount
    /// - rskMngVals [2] fillAmout
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
        spokeInitialized
    {
        bytes4 methodSelector = bytes4(keccak256(bytes(_methodSignature)));
        (
            address[6] memory rskMngAddrs,
            uint256[3] memory rskMngVals
        ) = __getRiskManagementArgs(_exchangeIndex, methodSelector, _encodedArgs);
        address adapter = exchanges[_exchangeIndex].adapter;
        address targetExchange = exchanges[_exchangeIndex].exchange;

        __validateCallOnExchange(_exchangeIndex, methodSelector, rskMngAddrs);

        IPolicyManager(__getRoutes().policyManager).preValidate(
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
        IPolicyManager(__getRoutes().policyManager).postValidate(
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

    function __getRiskManagementArgs(
        uint256 _exchangeIndex,
        bytes4 _methodSelector,
        bytes memory _encodedArgs
    )
        internal
        returns (address[6] memory, uint256[3] memory)
    {
        if (_methodSelector == TAKE_ORDER) {
            address adapter = exchanges[_exchangeIndex].adapter;
            (bool success, bytes memory returnData) = adapter.delegatecall(
                abi.encodeWithSelector(
                    OrderTaker(adapter).extractTakeOrderRiskManagementArgs.selector,
                    _encodedArgs
                )
            );
            require(success, "Encoded arguments might not match");
            return abi.decode(returnData, (address[6], uint256[3]));
        }
        else {
            revert("Method selector doesn't not exist");
        }
    }

    function __validateCallOnExchange(
        uint256 _exchangeIndex,
        bytes4 _methodSelector,
        address[6] memory _rskMngAddrs
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
                _rskMngAddrs[2]), 'Maker asset not registered'
            );
            require(registry.assetIsRegistered(
                _rskMngAddrs[3]), 'Taker asset not registered'
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
