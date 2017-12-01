pragma solidity ^0.4.17;

import '../dependencies/DBC.sol';
import './PreminedAsset.sol';
import 'ds-math/math.sol';

/// @title EtherToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Make Ether into a ERC20 compliant token
/// @notice Compliant to https://github.com/dapphub/ds-eth-token/blob/master/src/eth_wrapper.sol
contract EtherToken is DSMath, DBC, PreminedAsset {
    // FIELDS

    // Constant fields
    string public constant name = "Ether Token";
    string public constant symbol = "ETH-T";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // EVENTS

    event Deposit(address indexed who, uint amount);
    event Withdrawal(address indexed who, uint amount);

    // METHODS

    function EtherToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}

    function() payable { deposit(); }

    function deposit()
        payable
    {
        balances[msg.sender] = add(balances[msg.sender], msg.value);
        Deposit(msg.sender, msg.value);
    }

    function withdraw(uint amount)
        pre_cond(balances[msg.sender] >= amount)
    {
        balances[msg.sender] = sub(balances[msg.sender], amount);
        assert(msg.sender.send(amount));
        Withdrawal(msg.sender, amount);
    }
}
