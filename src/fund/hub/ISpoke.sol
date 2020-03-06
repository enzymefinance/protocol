pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./IHub.sol";

interface ISpoke {
    // STORAGE
    function hub() external view returns (IHub);
    function initialized() external view returns (bool);
    function routes() external view returns (IHub.Routes memory);

    // FUNCTIONS
    function engine() external view returns (address);
    function mlnToken() external view returns (address);
    function priceSource() external view returns (address);
    function fundFactory() external view returns (address);
    function registry() external view returns (address);

    // Caller: Hub only
    function initialize(address[10] calldata _spokes) external;
}
