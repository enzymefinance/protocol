pragma solidity 0.6.8;

/// @title Flexible ERC20 interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice support standard ERC20 and BadERC20. A 'BadERC20Token' token is one that uses an old version of the ERC20 standard. Basically, this version does not return anything from `transfer` and `transferFrom`, whereas most modern implementions of ERC20 return a boolean to indicate success or failure.
interface IERC20Flexible {
  function transfer(address _to, uint256 _value) external;
  function transferFrom(address _from, address _to, uint256 _value) external;
  function approve(address _spender, uint256 _value) external;
}
