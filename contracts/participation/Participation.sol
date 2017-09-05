pragma solidity ^0.4.11;

import './ParticipationInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';


/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
contract Participation is ParticipationInterface, DBC, Owned {
    //TODO: can we make this into a Permissioned contract?

    // TYPES

    struct Information { // subscription request
        bool isApproved; // Eg: Lookup call to uPort registry
    }

    // FIELDS

    // Function fields
    mapping (address => Information) public avatar;


    // NON-CONSTANT NON-BOOLEAN METHODS

    function list(address x)
        pre_cond(isOwner())
    {
        avatar[x].isApproved = true;
    }

    function bulkList(address[] x)
        pre_cond(isOwner())
    {
        for (uint i = 0; i < x.length; ++i) {
            avatar[x[i]].isApproved = true;
        }
    }

    function delist(address x)
        pre_cond(isOwner())
    {
        avatar[x].isApproved = false;
    }

    // CONSTANT METHODS

    /// Pre: Request ID
    /// Post: Boolean dependent on market data and on personel data; Compliance
    function isSubscribeRequestPermitted(
        address owner,
        uint256 numShares,
        uint256 offeredValue
    )
        constant
        returns (bool)
    {
        return avatar[owner].isApproved;
    }

    /// Pre: Request ID
    /// Post: Boolean whether permitted or not
    function isRedeemRequestPermitted(
        address owner,
        uint256 numShares,
        uint256 requestedValue
    )
        constant
        returns (bool)
    {
        return true;
    }
}
