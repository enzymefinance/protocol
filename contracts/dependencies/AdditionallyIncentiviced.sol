pragma solidity ^0.4.8;

import "./Assertive.sol";

/// @title Additionally Incentivised Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Functionality layer for imposing fees
contract AdditionallyIncentiviced is Assertive {

    // FIELDS

    // Fields that are only changed in constructor
    uint public fee;
    address public owner;

    // MODIFIERS

    modifier only_owner {
        assert(msg.sender == owner);
        _;
    }

    modifier msg_value_at_least(uint x) {
        assert(msg.value >= x);
        _;
    }

    // NON-CONSTANT METHODS

    function AdditionallyIncentiviced(uint setFee)
    {
        owner = msg.sender;
        fee = setFee;
    }

}
