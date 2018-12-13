pragma solidity ^0.4.21;

interface VersionInterface {
    event ShutDownVersion();
    function securityShutDown() external;
    function shutDownFund(address) external;
    function getShutDownStatus() external returns (bool);
}

