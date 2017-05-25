pragma solidity ^0.4.11;

import "./RedeemProtocol.sol";
import "../dependencies/Owned.sol";
import "../CoreProtocol.sol";


/// @title Redeem Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Redeem Module.
contract Redeem is RedeemProtocol, Owned {

    // FIELDS

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function Redeem() {}

    /// Pre:  Redeemer has at least `numShares` shares
    /// Post: Redeemer lost `numShares`, and gained a slice of each asset (`coreAssetAmt * (numShares/totalShares)`)
    function redeemShares(address ofCore, uint numShares)
        past_zero(numShares)
    {
        CoreProtocol Core = CoreProtocol(ofCore);
        //uint sharesValue = Core.calcValuePerShare(numShares);
        Core.annihilateSharesOnBehalf(msg.sender, numShares);
    }

    /// Pre:  Redeemer has at least `numShares` shares
    /// Post: Redeemer lost `numShares`, and gained `numShares * value` reference tokens
    function redeemSharesForReferenceAsset(address ofCore, uint numShares) {}
}
