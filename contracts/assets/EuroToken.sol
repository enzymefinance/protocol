pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title EuroToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract EuroToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Euro Token";
    string public constant symbol = "EUR-T";
    uint public constant decimals = 8;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function EuroToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}

}
