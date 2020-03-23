pragma solidity 0.6.4;

interface IFeeManager {
    function managementFeeAmount() external returns (uint256);
    function performanceFeeAmount() external returns (uint256);
    function rewardAllFees() external;
    function rewardManagementFee() external;
    function totalFeeAmount() external returns (uint256);
}

interface IFeeManagerFactory {
    function createInstance(
        address,
        address,
        address[] calldata,
        uint[] calldata,
        uint[] calldata,
        address
    ) external returns (address);
}
