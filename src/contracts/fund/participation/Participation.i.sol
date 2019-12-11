pragma solidity ^0.5.13;

/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface ParticipationInterface {
    event EnableInvestment (address[] asset);
    event DisableInvestment (address[] assets);

    event InvestmentRequest (
        address indexed requestOwner,
        address indexed investmentAsset,
        uint requestedShares,
        uint investmentAmount
    );

    event RequestExecution (
        address indexed requestOwner,
        address indexed executor,
        address indexed investmentAsset,
        uint investmentAmount,
        uint requestedShares
    );

    event CancelRequest (
        address indexed requestOwner
    );

    event Redemption (
        address indexed redeemer,
        address[] assets,
        uint[] assetQuantities,
        uint redeemedShares
    );

    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    ) external payable;
    function hasRequest(address) view returns (bool);
    function cancelRequest() external payable;
    function executeRequestFor(address requestOwner) external payable;
    function redeem() external;
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public;
}

interface ParticipationFactoryInterface {
    function createInstance(address _hub, address[] _defaultAssets, address _registry) external returns (address);
}
