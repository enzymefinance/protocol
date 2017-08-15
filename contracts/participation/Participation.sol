pragma solidity ^0.4.11;

import './ParticipationInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';


/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
contract Participation is ParticipationInterface, DBC, Owned {

    // TYPES

    struct Information { // subscription request
        bool isUPortIdentity; // Lookup call to uPort registry
    }

    // FIELDS

    // Fields that can be changed by functions
    mapping (address => Information) public avatar;


    // NON-CONSTANT NON-BOOLEAN METHODS

    function list(address x)
        pre_cond(isOwner())
    {
        avatar[x].isUPortIdentity = true;
    }

    function bulkList(address[] x)
        pre_cond(isOwner())
    {
        for (uint i = 0; i < x.length; ++i) {
            avatar[x[i]].isUPortIdentity = true;
        }
    }

    function delist(address x)
        pre_cond(isOwner())
    {
        avatar[x].isUPortIdentity = false;
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
        return avatar[owner].isUPortIdentity;
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
