pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Dogecoin token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract DogecoinToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Dogecoin Token";
    string public constant symbol = "DOGE-T";
    uint public constant decimals = 8;
    uint public constant preminedAmount = 10**18;

    // NON-CONSTANT METHODS

    function DogecoinToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
