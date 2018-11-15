pragma solidity ^0.4.21;

import "../../../dependencies/SafeMath.sol";
import "../0x/Ownable.sol";

/**
 * @title ERC20Basic
 * @dev Simpler version of ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/179
 */
contract ERC20Basic {
  function totalSupply() public view returns (uint256);
  function balanceOf(address who) public view returns (uint256);
  function transfer(address to, uint256 value) public returns (bool);
  event Transfer(address indexed from, address indexed to, uint256 value);
}

contract ERC20Extended is ERC20Basic {
  function allowance(address owner, address spender) public view returns (uint256);
  function transferFrom(address from, address to, uint256 value) public returns (bool);
  function approve(address spender, uint256 value) public returns (bool);
  event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**ERC20OldBasic.sol
 * @title ERC20Basic
 * @dev Simpler version of ERC20 interface
 */
contract ERC20OldBasic {
  function totalSupply() public view returns (uint256);
  function balanceOf(address who) public view returns (uint256);
  function transfer(address to, uint256 value) public;
  event Transfer(address indexed from, address indexed to, uint256 value);
}

/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 */
contract ERC20Old is ERC20OldBasic {
  function allowance(address owner, address spender) public view returns (uint256);
  function transferFrom(address from, address to, uint256 value) public;
  function approve(address spender, uint256 value) public returns (bool);
  event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract BasicToken is ERC20Basic {
  using SafeMath for uint256;

  mapping(address => uint256) balances;

  uint256 totalSupply_;

  /**
  * @dev total number of tokens in existence
  */
  function totalSupply() public view returns (uint256) {
    return totalSupply_;
  }

  /**
  * @dev transfer token for a specified address
  * @param _to The address to transfer to.
  * @param _value The amount to be transferred.
  */
  function transfer(address _to, uint256 _value) public returns (bool) {
    require(_to != address(0));
    require(_value <= balances[msg.sender]);

    // SafeMath.sub will throw if there is not enough balance.
    balances[msg.sender] = balances[msg.sender].sub(_value);
    balances[_to] = balances[_to].add(_value);
    Transfer(msg.sender, _to, _value);
    return true;
  }

  /**
  * @dev Gets the balance of the specified address.
  * @param _owner The address to query the the balance of.
  * @return An uint256 representing the amount owned by the passed address.
  */
  function balanceOf(address _owner) public view returns (uint256 balance) {
    return balances[_owner];
  }

}

/*

  Copyright Ethfinex Inc 2018

  Licensed under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0

*/

contract WrapperLock is BasicToken, Ownable {
    using SafeMath for uint256;

    address public TRANSFER_PROXY_VEFX;
    address public TRANSFER_PROXY_V2;
    mapping (address => bool) public isSigner;

    bool public erc20old;
    string public name;
    string public symbol;
    uint public decimals;
    address public originalToken;

    mapping (address => uint256) public depositLock;
    mapping (address => uint256) public balances;

    function WrapperLock(
        address _originalToken, 
        string _name, 
        string _symbol, 
        uint _decimals, 
        bool _erc20old, 
        address _proxyEfx, 
        address _proxyV2
    ) 
        Ownable() 
    {
        originalToken = _originalToken;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        isSigner[msg.sender] = true;
        erc20old = _erc20old;
        TRANSFER_PROXY_VEFX = _proxyEfx;
        TRANSFER_PROXY_V2 = _proxyV2;
    }

    function deposit(uint _value, uint _forTime) public returns (bool success) {
        require(_forTime >= 1);
        require(now + _forTime * 1 hours >= depositLock[msg.sender]);
        if (erc20old) {
            ERC20Old(originalToken).transferFrom(msg.sender, address(this), _value);
        } else {
            require(ERC20Extended(originalToken).transferFrom(msg.sender, address(this), _value));
        }
        balances[msg.sender] = balances[msg.sender].add(_value);
        totalSupply_ = totalSupply_.add(_value);
        depositLock[msg.sender] = now + _forTime * 1 hours;
        return true;
    }

    function withdraw(
        uint _value,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint signatureValidUntilBlock
    )
        public
        returns
        (bool success)
    {
        require(balanceOf(msg.sender) >= _value);
        if (now <= depositLock[msg.sender]) {
            require(block.number < signatureValidUntilBlock);
            require(isValidSignature(keccak256(msg.sender, address(this), signatureValidUntilBlock), v, r, s));
        }
        balances[msg.sender] = balances[msg.sender].sub(_value);
        totalSupply_ = totalSupply_.sub(_value);
        depositLock[msg.sender] = 0;
        if (erc20old) {
            ERC20Old(originalToken).transfer(msg.sender, _value);
        } else {
            require(ERC20Extended(originalToken).transfer(msg.sender, _value));
        }
        return true;
    }

    function withdrawBalanceDifference() public onlyOwner returns (bool success) {
        require(ERC20Extended(originalToken).balanceOf(address(this)).sub(totalSupply_) > 0);
        if (erc20old) {
            ERC20Old(originalToken).transfer(msg.sender, ERC20Extended(originalToken).balanceOf(address(this)).sub(totalSupply_));
        } else {
            require(ERC20Extended(originalToken).transfer(msg.sender, ERC20Extended(originalToken).balanceOf(address(this)).sub(totalSupply_)));
        }
        return true;
    }

    function withdrawDifferentToken(address _differentToken, bool _erc20old) public onlyOwner returns (bool) {
        require(_differentToken != originalToken);
        require(ERC20Extended(_differentToken).balanceOf(address(this)) > 0);
        if (_erc20old) {
            ERC20Old(_differentToken).transfer(msg.sender, ERC20Extended(_differentToken).balanceOf(address(this)));
        } else {
            require(ERC20Extended(_differentToken).transfer(msg.sender, ERC20Extended(_differentToken).balanceOf(address(this))));
        }
        return true;
    }

    function transfer(address _to, uint256 _value) public returns (bool) {
        return false;
    }

    function transferFrom(address _from, address _to, uint _value) public {
        require(isSigner[_to] || isSigner[_from]);
        assert(msg.sender == TRANSFER_PROXY_VEFX || msg.sender == TRANSFER_PROXY_V2);
        balances[_to] = balances[_to].add(_value);
        depositLock[_to] = depositLock[_to] > now ? depositLock[_to] : now + 1 hours;
        balances[_from] = balances[_from].sub(_value);
        Transfer(_from, _to, _value);
    }

    function allowance(address _owner, address _spender) public constant returns (uint) {
        if (_spender == TRANSFER_PROXY_VEFX || _spender == TRANSFER_PROXY_V2) {
            return 2**256 - 1;
        }
    }

    function balanceOf(address _owner) public constant returns (uint256) {
        return balances[_owner];
    }

    function isValidSignature(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        public
        constant
        returns (bool)
    {
        return isSigner[ecrecover(
            keccak256("\x19Ethereum Signed Message:\n32", hash),
            v,
            r,
            s
        )];
    }

    function addSigner(address _newSigner) public {
        require(isSigner[msg.sender]);
        isSigner[_newSigner] = true;
    }

    function keccak(address _sender, address _wrapper, uint _validTill) public constant returns(bytes32) {
        return keccak256(_sender, _wrapper, _validTill);
    }

}