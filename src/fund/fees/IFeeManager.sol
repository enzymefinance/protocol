pragma solidity 0.6.4;

/// @title FeeManager Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFeeManager {
    function managementFeeAmount() external returns (uint256);
    function performanceFeeAmount() external returns (uint256);
    function rewardAllFees() external;
    function rewardManagementFee() external;
    function totalFeeAmount() external returns (uint256);
}

/// @title FeeManagerFactory Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFeeManagerFactory {
    function createInstance(
        address,
        address,
        address[] calldata,
        uint[] calldata,
        uint[] calldata
    ) external returns (address);
}
