pragma solidity ^0.4.4;

import "./PreminedAsset.sol";

/// @title BitcoinToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract BitcoinToken is PreminedAsset {

    // FILEDS

    // Constant token specific fields
    string public constant name = "Bitcoin Token";
    string public constant symbol = "BTT";
    uint public constant precision = 8;
    uint public constant preminedAmount = 10**10;

    // METHODS

    function BitcoinToken()
        PreminedAsset(name, symbol, precision, preminedAmount)
    {}
}
