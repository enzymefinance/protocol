pragma solidity 0.6.4;

/// @title PolicyManager Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPolicyManager {
    function postValidate(bytes4, address[5] calldata, uint[3] calldata, bytes32) external;
    function preValidate(bytes4, address[5] calldata, uint[3] calldata, bytes32) external;
}

/// @title PolicyManagerFactory Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPolicyManagerFactory {
    function createInstance(address _hub) external returns (address);
}

