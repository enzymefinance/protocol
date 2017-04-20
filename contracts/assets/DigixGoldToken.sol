pragma solidity ^0.4.8;

import "./PreminedAsset.sol";

/// @title DigixGoldToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract DigixGoldToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Digix Gold Token";
    string public constant symbol = "DGX";
    uint public constant decimals = 9;
    uint public constant preminedAmount = 10**19;

    // NON-CONSTANT METHODS

    function DigixGoldToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
