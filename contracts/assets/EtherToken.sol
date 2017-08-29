pragma solidity ^0.4.11;

import './PreminedAsset.sol';

/// @title EtherToken Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Make Ether into a ERC20 compliant token
/// @notice Compliant to https://github.com/dapphub/ds-eth-token/blob/master/src/eth_wrapper.sol
contract EtherToken is PreminedAsset {
    using safeMath for uint256;

    // FIELDS

    // Constant token specific fields
    string public constant name = "Ether Token";
    string public constant symbol = "ETH-T";
    uint public constant decimals = 18;
    uint public constant preminedAmount = 10**28;

    // EVENTS

    event Deposit(address indexed who, uint amount);
    event Withdrawal(address indexed who, uint amount);

    // METHODS

    modifier balances_msg_sender_at_least(uint x) {
        assert(balances[msg.sender] >= x);
        _;
    }

    // NON-CONSTANT METHODS

    function EtherToken()
        PreminedAsset(name, symbol, decimals, preminedAmount)
    {}

    /// Post: Exchanged Ether against Token
    function() payable { deposit(); }

    /// Post: Exchanged Ether against Token
    function deposit()
        payable
    {
        balances[msg.sender] = balances[msg.sender].add(msg.value);
        Deposit(msg.sender, msg.value);
    }

    /// Post: Exchanged Token against Ether
    function withdraw(uint amount)
        balances_msg_sender_at_least(amount)
    {
        balances[msg.sender] = balances[msg.sender].sub(amount);
        assert(msg.sender.send(amount));
        Withdrawal(msg.sender, amount);
    }
}
