pragma solidity 0.6.4;

/// @title Hub Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IHub {
    enum FundStatus { Draft, Active, Inactive }

    function feeManager() external view returns (address);
    function MANAGER() external view returns (address);
    function policyManager() external view returns (address);
    function REGISTRY() external view returns (address);
    function shares() external view returns (address);
    function status() external view returns (FundStatus);
    function vault() external view returns (address);
}
