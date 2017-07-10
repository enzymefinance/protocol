pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title AventusCoin token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract AventusToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "AventCoin";
    string public constant symbol = "AVT";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function AventusToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
