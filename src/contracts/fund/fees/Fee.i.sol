pragma solidity ^0.4.25;

/// @dev Exposes "feeAmount", which maps fund state and fee state to uint
/// @dev Also exposes "updateState", which changes fee's internal state
interface Fee {
    function feeAmount() public view returns (uint);
    function initializeForUser(uint feeRate, uint feePeriod, address denominationAsset) external;
    function updateState() external;

    /// @notice Used to enforce a convention
    function identifier() external view returns (uint);
}

