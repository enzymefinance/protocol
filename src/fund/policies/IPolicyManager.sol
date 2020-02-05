pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./IPolicy.sol";
import "../hub/IHub.sol";

interface IPolicyManager {
    struct Entry {
        IPolicy[] pre;
        IPolicy[] post;
    }

    // FUNCTIONS
    function getPoliciesBySig(bytes4 _sig)
        external
        view
        returns (address[] memory, address[] memory);

    // Caller: Auth only
    function batchRegister(bytes4[] calldata _sig, address[] calldata _policies) external;
    function preValidate(
        bytes4 _sig,
        address[5] calldata _addresses,
        uint[3] calldata _values,
        bytes32 _identifier
    ) external;
    function postValidate(
        bytes4 _sig,
        address[5] calldata _addresses,
        uint[3] calldata _values,
        bytes32 _identifier
    ) external;
    function register(bytes4 _sig, address _policy) external;

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

interface IPolicyManagerFactory {
    function createInstance(address _hub) external returns (address);
}

