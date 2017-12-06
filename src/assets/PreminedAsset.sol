pragma solidity ^0.4.19;

import './Asset.sol';
import 'ds-math/math.sol';

/// @title PreminedAsset Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice An Asset with premined amount assigned to the creator, used to make markets
contract PreminedAsset is DSMath, Asset {
    // METHODS

    function PreminedAsset(string name, string symbol, uint decimals, uint amount)
        Asset(name, symbol, decimals)
    {
        balances[msg.sender] = add(balances[msg.sender], amount);
        totalSupply = add(totalSupply, amount);
    }
}
