pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Basic attention token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract BasicAttentionToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Basic Attention Token";
    string public constant symbol = "BAT";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function BasicAttentionToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
