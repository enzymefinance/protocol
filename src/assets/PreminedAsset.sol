pragma solidity ^0.4.19;

import '../assets/Asset.sol';

/// @title Premined asset Contract for testing
/// @author Melonport AG <team@melonport.com>
/// @notice Do not use in production environment net
contract PreminedAsset is Asset {

    /// @notice Asset with 10 ** 28 of premined token given to msg.sender
    function PreminedAsset() {
        totalSupply = rpow(10, 28);
        balances[msg.sender] = rpow(10, 28);
    }
}
