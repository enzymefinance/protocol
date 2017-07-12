pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Iconomi Token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract IconomiToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Iconomi Token";
    string public constant symbol = "ICN";
    uint8 public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function IconomiToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
