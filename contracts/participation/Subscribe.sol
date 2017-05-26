pragma solidity ^0.4.11;

import "./SubscribeProtocol.sol";
import "../assets/AssetProtocol.sol";
import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../dependencies/SafeMath.sol";
import "../assets/EtherToken.sol";
import "../CoreProtocol.sol";



/// @title Subscribe Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Subscribe Module.
contract Subscribe is SubscribeProtocol, DBC, SafeMath, Owned {

    // FIELDS

    // EVENTS

    event SharesCreated(address indexed byParticipant, uint atTimestamp, uint numShares);

    // PRE, POST, INVARIANT CONDITIONS

    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isAtLeast(uint x, uint y) internal returns (bool) { return x >= y; }

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function Subscribe() {}

    /// Pre: Investor pre-approves spending of core's reference asset to this contract
    /// Post: Invest in a fund by creating shares
    /* Rem:
     *  This can be seen as a non-persistent all or nothing limit order, where:
     *  amount == wantedShares and price == wantedShares/offeredAmount [Shares / Reference Asset]
     */
    function createSharesWithReferenceAsset(address ofCore, uint wantedShares, uint offeredValue)
        pre_cond(isPastZero(wantedShares))
    {
        CoreProtocol Core = CoreProtocol(ofCore);
        uint actualValue = Core.getSharePrice();
        allocateEtherInvestment(ofCore, actualValue, offeredValue, wantedShares);
    }

    /// Pre: EtherToken as Asset in Universe
    /// Post: Invest in a fund by creating shares
    function allocateEtherInvestment(
        address ofCore,
        uint actualValue,
        uint offeredValue,
        uint wantedShares
    )
        internal
        pre_cond(isAtLeast(offeredValue, actualValue))
    {
        //TODO check recipient
        CoreProtocol Core = CoreProtocol(ofCore);
        AssetProtocol RefAsset = AssetProtocol(address(Core.getReferenceAsset()));
        assert(RefAsset.transferFrom(msg.sender, this, actualValue)); // send funds from investor to this contract
        RefAsset.approve(ofCore, actualValue);
        Core.createSharesOnBehalf(msg.sender, wantedShares);
        SharesCreated(msg.sender, now, wantedShares);
    }
}
