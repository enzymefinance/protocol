pragma solidity ^0.4.8;

import "./PreminedAsset.sol";

/// @title BitcoinToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract BitcoinToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Bitcoin Token";
    string public constant symbol = "BTC-T";
    uint public constant decimals = 8;
    uint public constant preminedAmount = 10**18;

    // NON-CONSTANT METHODS

    function BitcoinToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
