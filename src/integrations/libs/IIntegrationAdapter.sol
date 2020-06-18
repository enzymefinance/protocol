pragma solidity 0.6.8;

/// @title Integration Adapter interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IIntegrationAdapter {
    function identifier() external pure returns (string memory);
    function parseIncomingAssets(bytes4, bytes calldata)
        external
        view
        returns (address[] memory);
}
