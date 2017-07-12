pragma solidity ^0.4.11;

import "./PreminedAsset.sol";

/// @title DigixDaoToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract DigixDaoToken is PreminedAsset {

    // FIELDS

    // Constant token specific fields
    string public constant name = "Digix Dao Token";
    string public constant symbol = "DGD";
    uint8 public constant decimals = 9;
    uint public constant preminedAmount = 10**28;

    // NON-CONSTANT METHODS

    function DigixDaoToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}
}
