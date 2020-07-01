pragma solidity 0.6.8;

/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 * Altered from https://github.com/OpenZeppelin/openzeppelin-solidity/blob/a466e76d26c394b1faa6e2797aefe34668566392/contracts/token/ERC20/ERC20.sol
 */
interface IERC20 {
  event Transfer(
    address indexed from,
    address indexed to,
    uint256 value
  );

  event Approval(
    address indexed owner,
    address indexed spender,
    uint256 value
  );

  function allowance(address _owner, address _spender) external view returns (uint256);
  function approve(address _spender, uint256 _value) external returns (bool);
  function balanceOf(address _who) external view returns (uint256);
  function totalSupply() external view returns (uint256);
  function transfer(address _to, uint256 _value) external returns (bool);
  function transferFrom(address _from, address _to, uint256 _value) external returns (bool);
}

/// @dev Just adds extra functions that we use elsewhere
abstract contract ERC20WithFields is IERC20 {
    string public symbol;
    string public name;
    uint8 public decimals;
}
