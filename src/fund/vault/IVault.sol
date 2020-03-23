pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../hub/ISpoke.sol";

interface IVault {
    // Caller: Auth only
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
    function fundFactory() external view returns (address);
}

interface IVaultFactory {
     function createInstance(
        address _hub,
        address[] calldata _exchanges,
        address[] calldata _adapters,
        address _registry
    ) external returns (address);
}
