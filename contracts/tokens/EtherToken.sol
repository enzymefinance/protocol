pragma solidity ^0.4.4;

import "../dependencies/ERC20.sol";
import "../dependencies/SafeMath.sol";

/// @title EtherToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Make Ether into a ERC20 compliant token
/// @notice Compliant to https://github.com/nexusdev/dappsys/blob/04451acf23f017beecb1a4cad4702deadc929811/contracts/token/base.sol
contract EtherToken is ERC20, SafeMath {

    // FIELDS

    // EVENTS

    event Deposit(address indexed who, uint amount);
    event Withdrawal(address indexed who, uint amount);

    // METHODS

    modifier balances_msg_sender_at_least(uint x) {
        assert(balances[msg.sender] >= x);
        _;
    }

    // CONSTANT METHODS

    // Pre: Each token equals one ether
    // Post: Amount of ether held as collateral
    function totalSupply() constant returns (uint supply) {
        return this.balance;
    }

    // NON-CONSTANT METHODS

    // Post: Exchanged Ether against Token
    function() payable { deposit(); }

    // Post: Exchanged Ether against Token
    function deposit()
        payable
        returns (bool)
    {
        balances[msg.sender] = safeAdd(balances[msg.sender], msg.value);
        Deposit(msg.sender, msg.value);
        return true;
    }

    // Post: Exchanged Token against Ether
    function withdraw(uint amount)
        balances_msg_sender_at_least(amount)
        returns (bool)
    {
        balances[msg.sender] = safeSub(balances[msg.sender], amount);
        assert(msg.sender.send(amount));
        Withdrawal(msg.sender, amount);
        return true;
    }
}
