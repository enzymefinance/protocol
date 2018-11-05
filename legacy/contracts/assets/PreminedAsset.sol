pragma solidity ^0.4.21;

import "../assets/Asset.sol";

/// @title Premined asset Contract for testing
/// @author Melonport AG <team@melonport.com>
/// @notice Do not use in production environment net
contract PreminedAsset is Asset {

    /// @notice Asset with 10 ** 28 of premined token given to msg.sender
    function PreminedAsset() {
        // Premine balances of contract creator and totalSupply
        balances[msg.sender] = 10 ** uint256(28);
        _totalSupply = 10 ** uint256(28);
    }
}
