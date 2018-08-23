pragma solidity ^0.4.21;


/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface Participation {
    function requestInvestment(uint giveQuantity, uint shareQuantity, address investmentAsset) external;
    function executeRequest(uint id) external;
    function cancelRequest(uint id) external;
    function enableInvestment(address[] ofAssets) external;
    function disableInvestment(address[] ofAssets) external;
    function redeemAllOwnedAssets(uint shareQuantiy) external returns (bool);
    function emergencyRedeem(uint shareQuantity, address[] requestedAssets) public returns (bool);
    function getLastRequestId() view returns (uint);
}

