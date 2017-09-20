pragma solidity ^0.4.11;

import '../dependencies/DBC.sol';
import './PreminedAsset.sol';

/// @title EtherToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Make Ether into a ERC20 compliant token
/// @notice Compliant to https://github.com/dapphub/ds-eth-token/blob/master/src/eth_wrapper.sol
contract EtherToken is DBC, PreminedAsset {
    using safeMath for uint256;

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
        balances[msg.sender] = balances[msg.sender].add(msg.value);
        Deposit(msg.sender, msg.value);
    }

    function withdraw(uint amount)
        pre_cond(balances[msg.sender] >= amount)
    {
        balances[msg.sender] = balances[msg.sender].sub(amount);
        assert(msg.sender.send(amount));
        Withdrawal(msg.sender, amount);
    }
}
