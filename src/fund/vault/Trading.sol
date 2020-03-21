pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSAuth.sol";
import "../../dependencies/libs/EnumerableSet.sol";
import "../../registry/IRegistry.sol";
import "../hub/SpokeAccessor.sol";
import "../policies/IPolicyManager.sol";
import "../policies/TradingSignatures.sol";

contract Trading is DSAuth, SpokeAccessor, TradingSignatures {
    using EnumerableSet for EnumerableSet.AddressSet;

    event AdaptersDisabled (address[] adapters);

    event AdaptersEnabled (address[] adapters, address[] exchanges);

    // @dev This seems odd now, but we will have an "integrationType" field when we shift to Integrations
    struct Exchange {
        address exchange;
    }

    EnumerableSet.AddressSet private enabledAdapters;
    mapping (address => Exchange) public adapterToExchange;

    // TODO: edit constructor order?
    constructor(address[] memory _exchanges, address[] memory _adapters, address _registry)
        public
    {
        __enableAdapters(_adapters, _exchanges, _registry);
    }

    // EXTERNAL FUNCTIONS

    function disableAdapters(address[] calldata _adapters) external auth {
        for (uint256 i = 0; i < _adapters.length; i++) {
            EnumerableSet.remove(enabledAdapters, _adapters[i]);
            delete adapterToExchange[_adapters[i]];
        }
        emit AdaptersDisabled(_adapters);
    }

    function enableAdapters(address[] calldata _adapters, address[] calldata _exchanges)
        external
        auth
    {
        __enableAdapters(_adapters, _exchanges, __getRoutes().registry);
    }

    function getEnabledAdapters() external view returns (address[] memory) {
        return EnumerableSet.enumerate(enabledAdapters);
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

    // PRIVATE FUNCTIONS

    function __enableAdapters(
        address[] memory _adapters,
        address[] memory _exchanges,
        address _registry
    )
        private
    {
        require(
            _exchanges.length == _adapters.length,
            "__enableAdapters: unequal exchanges and adapters array lengths"
        );
        for (uint256 i = 0; i < _adapters.length; i++) {
            IRegistry registry = IRegistry(_registry);
            require(
                registry.exchangeAdapterIsRegistered(_adapters[i]),
                "__enableAdapters: Adapter is not registered"
            );
            require(
                registry.exchangeForAdapter(_adapters[i]) == _exchanges[i],
                "__enableAdapters: Exchange and adapter do not match"
            );

            EnumerableSet.add(enabledAdapters, _adapters[i]);
            adapterToExchange[_adapters[i]] = Exchange(_exchanges[i]);
        }
        emit AdaptersEnabled(_adapters, _exchanges);
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
