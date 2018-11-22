pragma solidity ^0.4.21;


/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface ParticipationInterface {
    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    ) external payable;
    function hasRequest(address) view returns (bool);
    function cancelRequest() external;
    function executeRequest() external payable;
    function executeRequestFor(address requestOwner) external payable;
    function redeem() public;
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public;
}

