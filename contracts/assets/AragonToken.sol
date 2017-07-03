pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Aragon network token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract AragonToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Aragon Network Token";
    string public constant symbol = "ANT";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**18;

    // NON-CONSTANT METHODS

    function AragonToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
