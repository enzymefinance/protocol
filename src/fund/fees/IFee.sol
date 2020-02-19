pragma solidity 0.6.1;

/// @dev Exposes "feeAmount", which maps fund state and fee state to uint
/// @dev Notice that "feeAmount" *may* change contract state
/// @dev Also exposes "updateState", which changes fee's internal state
interface IFee {
    function initializeForUser(uint feeRate, uint feePeriod, address denominationAsset) external;
    function feeAmount() external returns (uint);
    function updateState() external;

    /// @notice Used to enforce a convention
    function identifier() external view returns (uint);
}

