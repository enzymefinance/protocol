pragma solidity ^0.4.19;

import "ds-math/math.sol";
import "./AssetInterface.sol";
import "./ERC223ReceivingContract.sol";
import "./ERC223Interface.sol";

/// @title Asset Contract for creating ERC20 compliant assets.
/// @author Melonport AG <team@melonport.com>
/// @notice Implementation of ERC223 inspired by https://github.com/raiden-network/raiden-token/blob/master/contracts/token.sol
contract Asset is DSMath, AssetInterface, ERC223Interface {

    // DATA STRUCTURES

    mapping (address => uint) balances;
    mapping (address => mapping (address => uint)) allowed;
    uint public totalSupply;

    // PUBLIC METHODS

    /**
     * @notice Send `_value` tokens to `_to` from `msg.sender`
     * @dev Transfers sender's tokens to a given address
     * @dev Similar to transfer(address, uint, bytes), but without _data parameter
     * @param _to Address of token receiver
     * @param _value Number of tokens to transfer
     * @return Returns success of function call
     */
    function transfer(address _to, uint _value)
        public
        returns (bool success)
    {
        uint codeLength;
        bytes memory empty;

        assembly {
            // Retrieve the size of the code on target address, this needs assembly.
            codeLength := extcodesize(_to)
        }
 
        require(balances[msg.sender] >= _value); // sanity checks
        require(balances[_to] + _value >= balances[_to]);

        balances[msg.sender] = sub(balances[msg.sender], _value);
        balances[_to] = add(balances[_to], _value);
        // if (codeLength > 0) {
        //     ERC223ReceivingContract receiver = ERC223ReceivingContract(_to);
        //     receiver.tokenFallback(msg.sender, _value, empty);
        // }
        Transfer(msg.sender, _to, _value, empty);
        return true;
    }

    /**
     * @notice Send `_value` tokens to `_to` from `msg.sender` and trigger tokenFallback if sender is a contract
     * @dev Function that is called when a user or contract wants to transfer funds
     * @param _to Address of token receiver
     * @param _value Number of tokens to transfer
     * @param _data Data to be sent to tokenFallback
     * @return Returns success of function call
     */
    function transfer(address _to, uint _value, bytes _data)
        public
        returns (bool success)
    {
        uint codeLength;

        assembly {
            // Retrieve the size of the code on target address, this needs assembly.
            codeLength := extcodesize(_to)
        }

        require(balances[msg.sender] >= _value); // sanity checks
        require(balances[_to] + _value >= balances[_to]);

        balances[msg.sender] = sub(balances[msg.sender], _value);
        balances[_to] = add(balances[_to], _value);
        // if (codeLength > 0) {
        //     ERC223ReceivingContract receiver = ERC223ReceivingContract(_to);
        //     receiver.tokenFallback(msg.sender, _value, _data);
        // }
        Transfer(msg.sender, _to, _value);
        return true;
    }

    /// @notice Transfer `_value` tokens from `_from` to `_to` if `msg.sender` is allowed.
    /// @notice Restriction: An account can only use this function to send to itself
    /// @dev Allows for an approved third party to transfer tokens from one
    /// address to another. Returns success.
    /// @param _from Address from where tokens are withdrawn.
    /// @param _to Address to where tokens are sent.
    /// @param _value Number of tokens to transfer.
    /// @return Returns success of function call.
    function transferFrom(address _from, address _to, uint _value)
        public
        returns (bool)
    {
        require(_from != 0x0);
        require(_to != 0x0);
        require(_to != address(this));
        require(balances[_from] >= _value);
        require(allowed[_from][msg.sender] >= _value);
        require(balances[_to] + _value >= balances[_to]);
        // require(_to == msg.sender); // can only use transferFrom to send to self

        balances[_to] += _value;
        balances[_from] -= _value;
        allowed[_from][msg.sender] -= _value;

        Transfer(_from, _to, _value);
        return true;
    }

    /// @notice Allows `_spender` to transfer `_value` tokens from `msg.sender` to any address.
    /// @dev Sets approved amount of tokens for spender. Returns success.
    /// @param _spender Address of allowed account.
    /// @param _value Number of approved tokens.
    /// @return Returns success of function call.
    function approve(address _spender, uint _value) public returns (bool) {
        require(_spender != 0x0);

        // To change the approve amount you first have to reduce the addresses`
        // allowance to zero by calling `approve(_spender, 0)` if it is not
        // already 0 to mitigate the race condition described here:
        // https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
        // require(_value == 0 || allowed[msg.sender][_spender] == 0);

        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    // PUBLIC VIEW METHODS

    /// @dev Returns number of allowed tokens that a spender can transfer on
    /// behalf of a token owner.
    /// @param _owner Address of token owner.
    /// @param _spender Address of token spender.
    /// @return Returns remaining allowance for spender.
    function allowance(address _owner, address _spender)
        constant
        public
        returns (uint)
    {
        return allowed[_owner][_spender];
    }

    /// @dev Returns number of tokens owned by the given address.
    /// @param _owner Address of token owner.
    /// @return Returns balance of owner.
    function balanceOf(address _owner) constant public returns (uint) {
        return balances[_owner];
    }
}
