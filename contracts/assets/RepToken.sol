pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title RepToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract RepToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Rep Token";
    string public constant symbol = "REP-T";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function RepToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
      
}
