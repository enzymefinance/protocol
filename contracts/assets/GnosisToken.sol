pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Gnosis token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract GnosisToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Gnosis Token";
    string public constant symbol = "GNO";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function GnosisToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}

}
