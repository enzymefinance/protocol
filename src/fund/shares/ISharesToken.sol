pragma solidity 0.6.4;

/// @title SharesToken Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface ISharesToken {
    function createFor(address, uint256) external;
}
