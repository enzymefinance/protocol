pragma solidity 0.6.1;

/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface IParticipation {
    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    ) external payable;
    function hasRequest(address) external view returns (bool);
    function cancelRequest() external payable;
    function executeRequestFor(address requestOwner) external payable;
    function redeem() external;
    function redeemWithConstraints(uint shareQuantity, address[] calldata requestedAssets) external;
}

interface IParticipationFactory {
    function createInstance(address _hub, address[] calldata _defaultAssets, address _registry) external returns (address);
}
