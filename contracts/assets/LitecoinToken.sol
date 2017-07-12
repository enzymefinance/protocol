pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Litecoin token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract LitecoinToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Litecoin Token";
    string public constant symbol = "LTC-T";
    uint8 public constant decimals = 8;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function LitecoinToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
