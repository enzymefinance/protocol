pragma solidity 0.6.4;

interface IHub {
    struct Routes {
        address accounting;
        address feeManager;
        address policyManager;
        address shares;
        address vault;
        address registry;
        address fundFactory;
    }

    function accounting() external view returns (address);
    function feeManager() external view returns (address);
    function fundInitialized() external view returns (bool);
    function getName() external view returns (string memory);
    function isShutDown() external view returns (bool);
    function isSpoke(address) external view returns (bool);
    function manager() external view returns (address);
    function policyManager() external view returns (address);
    function shares() external view returns (address);
}
