pragma solidity ^0.4.11;

import './Asset.sol';
import '../libraries/safeMath.sol';

/// @title PreminedAsset Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract PreminedAsset is Asset {
    using safeMath for uint256;

    // METHODS

    function PreminedAsset(string name, string symbol, uint decimals, uint256 amount)
        Asset(name, symbol, decimals)
    {
        balances[msg.sender] = balances[msg.sender].add(amount);
        totalSupply = totalSupply.add(amount);
    }
}
