pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Bancor network token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract BancorNetworkToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Bancor Network Token";
    string public constant symbol = "BNT";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**18;

    // NON-CONSTANT METHODS

    function BancorNetworkToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
