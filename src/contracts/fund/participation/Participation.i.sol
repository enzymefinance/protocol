pragma solidity ^0.4.21;

/// @notice Investor Fund interactions
/// @notice Handles redemptions and requests for investment
interface ParticipationInterface {
    function invest(uint, uint, address) external payable;
    function redeem() public;
    function redeemWithConstraints(uint shareQuantity, address[] requestedAssets) public;
}

