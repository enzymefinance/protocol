pragma solidity ^0.4.21;

/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface ParticipationInterface {
    event DisableInvestment (
        address[] assets
    );

    event EnableInvestment (
        address asset
    );

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
    function cancelRequest() external;
    function executeRequestFor(address requestOwner) external payable;
    function redeem() public;
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public;
}

