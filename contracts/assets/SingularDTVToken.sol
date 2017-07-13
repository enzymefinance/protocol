pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Ripple token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract SingularDTVToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "SingularDTV Token";
    string public constant symbol = "SNGLS";
    uint8 public constant decimals = 0;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function SingularDTVToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
