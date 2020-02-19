pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/IHub.sol";

interface ITrading {
    struct Exchange {
        address exchange;
        address adapter;
    }

    // STORAGE
    function adapterIsAdded(address) external view returns (bool);
    function exchanges(uint256 _index) external view returns (Exchange memory);

    // FUNCTIONS
    function callOnExchange(
        uint _exchangeIndex,
        string calldata _methodSignature,
        address[8] calldata _orderAddresses,
        uint[8] calldata _orderValues,
        bytes[4] calldata _orderData,
        bytes32 _identifier,
        bytes calldata _signature
    ) external;
    function getExchangeInfo()
        external
        view
        returns (address[] memory, address[] memory);

    // Caller: Auth only
    function addExchange(address _exchange, address _adapter) external;
    function withdraw(address _token, uint _amount) external;

    // INHERITED: ISpoke
    // STORAGE
    function hub() external view returns (IHub);
    function initialized() external view returns (bool);
    function routes() external view returns (IHub.Routes memory);

    // FUNCTIONS
    function engine() external view returns (address);
    function mlnToken() external view returns (address);
    function priceSource() external view returns (address);
    function version() external view returns (address);
    function registry() external view returns (address);
}

interface ITradingFactory {
     function createInstance(
        address _hub,
        address[] calldata _exchanges,
        address[] calldata _adapters,
        address _registry
    ) external returns (address);
}
