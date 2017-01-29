pragma solidity ^0.4.4;

import "./PreminedAsset.sol";

/// @title RepToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract RepToken is PreminedAsset {

    // FILEDS

    // Constant token specific fields
    string public constant name = "Rep Token";
    string public constant symbol = "REP";
    uint public constant precision = 8;
    uint public constant preminedAmount = 10**18;

    // NON-CONSTANT METHODS

    function RepToken()
        PreminedAsset(name, symbol, precision, preminedAmount)
    {}
}
