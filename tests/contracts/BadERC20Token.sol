pragma solidity 0.6.8;

import "main/dependencies/SafeMath.sol";

// A 'BadERC20Token' token is one that uses an old version of the ERC20 standard,
// as described here https://medium.com/coinmonks/missing-return-value-bug-at-least-130-tokens-affected-d67bf08521ca
// Basically, this version does not return anything from `transfer` and `transferFrom`,
// whereas most modern implementions of ERC20 return a boolean to indicate success or failure.
contract BadERC20Token {
    string public symbol;
    string public  name;
    uint8 public decimals;

    using SafeMath for uint256;

    mapping (address => uint256) private balances;
    mapping (address => mapping (address => uint256)) private allowances;
    uint256 private totalSupply;

    constructor(string memory _symbol, uint8 _decimals, string memory _name) public {
        symbol = _symbol;
        decimals = _decimals;
        name = _name;
        totalSupply = 1000000 * 10**uint(decimals);
        balances[msg.sender] = totalSupply;
    }

    function balanceOf(address _account) public view returns (uint256) {
        return balances[_account];
    }

    function transfer(address _to, uint _value) public {
        balances[msg.sender] = balances[msg.sender].sub(_value);
        balances[_to] = balances[_to].add(_value);
    }

    function transferFrom(address _from, address _to, uint _value) public {
        uint256 _allowance = allowances[_from][msg.sender];

        balances[_to] = balances[_to].add(_value);
        balances[_from] = balances[_from].sub(_value);
        allowances[_from][msg.sender] = _allowance.sub(_value);
    }

    function approve(address _spender, uint _value) public {
        allowances[msg.sender][_spender] = _value;
    }

    function allowance(address _owner, address _spender) public view returns (uint256 remaining) {
        return allowances[_owner][_spender];
    }
}
