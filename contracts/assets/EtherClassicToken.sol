pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title Ethereum classic token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Make Ether into a ERC20 compliant token
contract EtherClassicToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Ether Classic Token";
    string public constant symbol = "ETC-T";
    uint8 public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function EtherClassicToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
