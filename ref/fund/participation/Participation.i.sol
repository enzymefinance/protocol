pragma solidity ^0.4.21;


/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface Participation {
    function requestInvestment(
        uint requestedShares,
        uint investmentAmount,
        address investmentAsset
    ) external;
    function cancelRequest() external;
    function executeRequest() external;
    function executeRequestFor(address requestOwner) external;
    function redeem() public;
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public returns (bool);
}

