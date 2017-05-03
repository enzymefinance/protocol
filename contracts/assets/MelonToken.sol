pragma solidity ^0.4.8;

import "./PreminedAsset.sol";

/// @title RepToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract MelonToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Melon Token";
    string public constant symbol = "MLN-T";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function MelonToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
