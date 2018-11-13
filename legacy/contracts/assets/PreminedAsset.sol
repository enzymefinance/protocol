pragma solidity ^0.4.21;

import "../assets/Asset.sol";

/// @title Premined asset Contract for testing
/// @author Melonport AG <team@melonport.com>
/// @notice Do not use in production environment net
contract PreminedAsset is Asset {

    // Constructor fields
    uint public decimals;

    /// @notice Asset with 10 ** 28 of premined token given to msg.sender
    function PreminedAsset(uint _decimals) {
        decimals = _decimals;
        balances[msg.sender] = 10 ** uint256(28);
        _totalSupply = 10 ** uint256(28);
    }
}
