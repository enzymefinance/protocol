pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Status network token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract StatusToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Status Network Token";
    string public constant symbol = "SNT";
    uint8 public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function StatusToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
