pragma solidity ^0.4.4;

import "./PreminedToken.sol";

/// @title Premine Token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract BitcoinToken is PreminedToken {

    // FILEDS

    // Constant token specific fields
    string public constant name = "Bitcoin Token";
    string public constant symbol = "BTT";
    uint public constant precision = 8;
    uint public constant preminedAmount = 10**10;

    // METHODS

    function BitcoinToken()
        PreminedToken(name, symbol, precision, preminedAmount)
    {}
}
