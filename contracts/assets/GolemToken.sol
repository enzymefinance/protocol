pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title GolemToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract GolemToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Golem Network Token";
    string public constant symbol = "GNT";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**18;

    // NON-CONSTANT METHODS

    function GolemToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
