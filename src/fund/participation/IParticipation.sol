pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/IHub.sol";

interface IParticipation {
    struct Request {
        address investmentAsset;
        uint investmentAmount;
        uint requestedShares;
        uint timestamp;
    }

    // STORAGE
    function hasInvested(address) external view returns (bool);
    function historicalInvestors(uint256 _index) external view returns (address);
    function investAllowed(address) external view returns (bool);
    function REQUEST_LIFESPAN() external view returns (uint256);
    function requests(address) external view returns (Request memory);
    function SHARES_DECIMALS() external view returns (uint256);

    // FUNCTIONS
    function cancelRequest() external payable;
    function cancelRequestFor(address _requestOwner) external payable;
    function executeRequestFor(address _requestOwner) external payable;
    function getHistoricalInvestors() external view returns (address[] memory);
    function getOwedPerformanceFees(uint256 _shareQuantity) external returns (uint256);
    function hasExpiredRequest(address _who) external view returns (bool);
    function hasRequest(address _who) external view returns (bool);
    function hasValidRequest(address _who) external view returns (bool);
    function redeem() external;
    function redeemQuantity(uint256 _shareQuantity) external;
    function redeemWithConstraints(
        uint256 _shareQuantity,
        address[] calldata _requestedAssets
    ) external;
    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    ) external payable;

    // Caller: Auth only
    function disableInvestment(address[] calldata _assets) external;
    function enableInvestment(address[] calldata _assets) external;

    // INHERITED: ISpoke
    // STORAGE
    function hub() external view returns (IHub);
    function initialized() external view returns (bool);
    function routes() external view returns (IHub.Routes memory);

    // FUNCTIONS
    function engine() external view returns (address);
    function mlnToken() external view returns (address);
    function priceSource() external view returns (address);
    function fundFactory() external view returns (address);
    function registry() external view returns (address);
}

interface IParticipationFactory {
    function createInstance(address _hub, address[] calldata _defaultAssets, address _registry) external returns (address);
}
