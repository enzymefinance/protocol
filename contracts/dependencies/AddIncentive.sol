pragma solidity ^0.4.11;

/// @title Additionally Incentivised Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Functionality layer for imposing fees
contract AddIncentive {

    // FIELDS

    // Fields that are only changed in constructor
    uint public fee;
    address public owner;

    // CONDITIONS

    function msg_value_at_least(uint x)
        internal
        returns (bool)
    {
        return msg.value >= x;
    }

    // NON-CONSTANT METHODS

    function AddIncentive(uint setFee)
    {
        owner = msg.sender;
        fee = setFee;
    }

}
