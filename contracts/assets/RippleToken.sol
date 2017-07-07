pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Ripple token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract RippleToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Ripple Token";
    string public constant symbol = "XRP";
    uint public constant decimals = 6;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function RippleToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
