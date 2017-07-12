pragma solidity ^0.4.11;

/// @title Participation Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Participation Contract
contract ParticipationProtocol {

    // EVENTS

    event Subscribed(address indexed byParticipant, uint atTimestamp, uint numShares);
    event Redeemed(address indexed byParticipant, uint atTimestamp, uint numShares);

    // CONSTANT METHODS

    function isSubscribePermitted(address byParticipant, uint wantedShares) {}
    function isRedeemPermitted(address byParticipant, uint wantedShares) {}
}
