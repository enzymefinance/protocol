pragma solidity ^0.4.21;

import "../assets/Shares.sol";

/// @title Restricted Shares Contract to prevent secondary trading of shares.
/// @author Melonport AG <team@melonport.com>
/// @notice Fund
contract RestrictedShares is Shares {

    // CONSTRUCTOR

    /// @param _name Name these shares
    /// @param _symbol Symbol of shares
    /// @param _decimal Amount of decimals sharePrice is denominated in, defined to be equal as deciamls in REFERENCE_ASSET contract
    /// @param _creationTime Timestamp of share creation
    function RestrictedShares(
        bytes32 _name,
        bytes8 _symbol,
        uint _decimal,
        uint _creationTime
    ) Shares(_name, _symbol, _decimal, _creationTime) {}

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
        require(msg.sender == address(this) || _to == address(this));
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
        if (codeLength > 0) {
            ERC223ReceivingContract receiver = ERC223ReceivingContract(_to);
            receiver.tokenFallback(msg.sender, _value, empty);
        }
        Transfer(msg.sender, _to, _value);
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
        require(msg.sender == address(this) || _to == address(this));
        
        bytes memory empty;
        uint codeLength;

        assembly {
            // Retrieve the size of the code on target address, this needs assembly.
            codeLength := extcodesize(_to)
        }

        require(balances[msg.sender] >= _value); // sanity checks
        require(balances[_to] + _value >= balances[_to]);

        balances[msg.sender] = sub(balances[msg.sender], _value);
        balances[_to] = add(balances[_to], _value);
        if (codeLength > 0) {
            ERC223ReceivingContract receiver = ERC223ReceivingContract(_to);
            receiver.tokenFallback(msg.sender, _value, _data);
        }
        Transfer(msg.sender, _to, _value);
        return true;
    }

    /// @notice Allows `_spender` to transfer `_value` tokens from `msg.sender` to any address.
    /// @dev Sets approved amount of tokens for spender. Returns success.
    /// @param _spender Address of allowed account.
    /// @param _value Number of approved tokens.
    /// @return Returns success of function call.
    function approve(address _spender, uint _value) public returns (bool) {
        require(msg.sender == address(this));
        require(_spender != 0x0);

        // To change the approve amount you first have to reduce the addresses`
        // allowance to zero by calling `approve(_spender, 0)` if it is not
        // already 0 to mitigate the race condition described here:
        // https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
        require(_value == 0 || allowed[msg.sender][_spender] == 0);

        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

}
