pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

interface IHub {
    struct Routes {
        address accounting;
        address feeManager;
        address participation;
        address policyManager;
        address shares;
        address vault;
        address registry;
        address version;
        address engine;
        address mlnToken;
    }

    // STORAGE
    function creationTime() external view returns (uint256);
    function creator() external view returns (address);
    function isShutDown() external view returns (bool);
    function isSpoke(address) external view returns (bool);
    function manager() external view returns (address);
    function name() external view returns (string memory);
    function permissionsSet() external view returns (bool);
    function routes() external view returns (Routes memory);
    function routingSet() external view returns (bool);
    function spokesSet() external view returns (bool);

    // FUNCTIONS
    function accounting() external view returns (address);
    function participation() external view returns (address);
    function policyManager() external view returns (address);
    function priceSource() external view returns (address);
    function registry() external view returns (address);
    function shares() external view returns (address);
    function vault() external view returns (address);
    function version() external view returns (address);

    // Caller: Creator only:
    function setPermissions() external;
    function setRouting() external;
    function setSpokes(address[10] calldata _spokes) external;

    // Caller: Version contract only:
    function shutDownFund() external;
}
