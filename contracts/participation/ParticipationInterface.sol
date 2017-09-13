pragma solidity ^0.4.11;

/// @title Participation Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Participation Contract
contract ParticipationInterface {

    // CONSTANT METHODS

    function isSubscriptionPermitted(
        address owner,
        uint256 numShares,
        uint256 offeredValue
    ) constant returns (bool) {}
    function isRedemptionPermitted(
        address owner,
        uint256 numShares,
        uint256 requestedValue
    ) constant returns (bool) {}
}
