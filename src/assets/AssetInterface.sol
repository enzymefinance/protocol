pragma solidity ^0.4.21;

/// @title Asset Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Asset (ERC233) Contract
/// @notice Implementation inspired by https://github.com/raiden-network/raiden-token/blob/master/contracts/token.sol
interface AssetInterface {
    /*
     * Implements ERC 20 standard.
     * https://github.com/ethereum/EIPs/blob/f90864a3d2b2b45c4decf95efd26b3f0c276051a/EIPS/eip-20-token-standard.md
     * https://github.com/ethereum/EIPs/issues/20
     *
     *  Added support for the ERC 223 "tokenFallback" method in a "transfer" function with a payload.
     *  https://github.com/ethereum/EIPs/issues/223
     */

    // Events
    event Approval(address indexed _owner, address indexed _spender, uint _value);

    // There is no ERC223 compatible Transfer event, with `_data` included.

    //ERC 223
    // PUBLIC METHODS
    function transfer(address _to, uint _value, bytes _data) public returns (bool success);

    // ERC 20
    // PUBLIC METHODS
    function transfer(address _to, uint _value) public returns (bool success);
    function transferFrom(address _from, address _to, uint _value) public returns (bool success);
    function approve(address _spender, uint _value) public returns (bool success);
    // PUBLIC VIEW METHODS
    function balanceOf(address _owner) view public returns (uint balance);
    function allowance(address _owner, address _spender) public view returns (uint remaining);
}
