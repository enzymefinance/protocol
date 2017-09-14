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
        bool isApproved; // Eg: Lookup call to uPort registry
    }

    // FIELDS

    // Function fields
    mapping (address => Information) public persona;

    // CONSTANT METHODS

    /// @dev Pre: Request ID
    /// @dev Post Boolean dependent on market data and on personel data; Compliance
    function isSubscriptionPermitted(
        address owner,
        uint256 numShares,
        uint256 offeredValue
    )
        constant
        returns (bool)
    {
        return persona[owner].isApproved;
    }

    /// @dev Pre: Request ID
    /// @dev Post Boolean whether permitted or not
    function isRedemptionPermitted(
        address owner,
        uint256 numShares,
        uint256 requestedValue
    )
        constant
        returns (bool)
    {
        return true;
    }

    // NON-CONSTANT METHODS

    function list(address x)
        pre_cond(isOwner())
    {
        persona[x].isApproved = true;
    }

    function bulkList(address[] x)
        pre_cond(isOwner())
    {
        for (uint i = 0; i < x.length; ++i) {
            persona[x[i]].isApproved = true;
        }
    }

    function delist(address x)
        pre_cond(isOwner())
    {
        persona[x].isApproved = false;
    }

    function bulkDelist(address[] x)
        pre_cond(isOwner())
    {
        for (uint i = 0; i < x.length; ++i) {
            persona[x[i]].isApproved = false;
        }
    }

}
