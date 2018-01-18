pragma solidity ^0.4.19;

/// @title ERC223ReceivingContractInterface - Standard contract implementation for compatibility with ERC223 tokens.
/// @author Melonport AG <team@melonport.com>
/// @notice Contract that is working with ERC223 tokens https://github.com/ethereum/EIPs/issues/223
/// @notice Interface inspired by https://github.com/raiden-network/raiden-token/blob/master/contracts/token.sol
interface ERC223ReceivingContract {

    /// @dev Function that is called when a user or another contract wants to transfer funds.
    /// @param _from Transaction initiator, analogue of msg.sender
    /// @param _value Number of tokens to transfer.
    /// @param _data Data containig a function signature and/or parameters
    function tokenFallback(address _from, uint256 _value, bytes _data) public;
}
