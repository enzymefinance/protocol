pragma solidity 0.6.8;

/// @title Integration Adapter interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IIntegrationAdapter {
    function identifier() external pure returns (string memory);
}
