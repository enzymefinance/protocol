pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./IFee.sol";
import "../hub/IHub.sol";

interface IFeeManager {
    // STORAGE
    function feeIsRegistered(address) external view returns (bool);
    function fees(uint256 _index) external view returns (IFee);

    // FUNCTIONS
    function managementFeeAmount() external returns (uint256);
    function performanceFeeAmount() external returns (uint256);
    function rewardManagementFee() external;
    function totalFeeAmount() external returns (uint256);

    // Caller: Auth only
    function rewardAllFees() external;

    // INHERITED: ISpoke
    // STORAGE
    function hub() external view returns (IHub);
    function initialized() external view returns (bool);
    function routes() external view returns (IHub.Routes memory);

    // FUNCTIONS
    function engine() external view returns (address);
    function mlnToken() external view returns (address);
    function priceSource() external view returns (address);
    function version() external view returns (address);
}

interface IFeeManagerFactory {
    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] calldata _fees,
        uint[] calldata _feeRates,
        uint[] calldata _feePeriods,
        address _registry
    ) external returns (address);
}
