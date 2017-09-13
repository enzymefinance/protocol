pragma solidity ^0.4.11;

/// @title Participation Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Participation Contract
contract ParticipationInterface {

    // CONSTANT METHODS

    /// @dev Pre: Request ID
    /// @dev Post Boolean dependent on market data and on personel data; Compliance
    function isSubscribeRequestPermitted(
        address owner,
        uint256 numShares,
        uint256 offeredValue
    )
        constant
        returns (bool)
    {}
    /// @dev Pre: Request ID
    /// @dev Post Boolean whether permitted or not
    function isRedeemRequestPermitted(
        address owner,
        uint256 numShares,
        uint256 requestedValue
    )
        constant
        returns (bool)
    {}

}
