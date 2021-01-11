// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./VaultLibSafeMath.sol";

/// @title StandardERC20 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Contains the storage, events, and default logic of an ERC20-compliant contract.
/// @dev The logic can be overridden by VaultLib implementations.
/// Adapted from OpenZeppelin 3.2.0.
/// DO NOT EDIT THIS CONTRACT.
abstract contract SharesTokenBase {
    using VaultLibSafeMath for uint256;

    event Approval(address indexed owner, address indexed spender, uint256 value);

    event Transfer(address indexed from, address indexed to, uint256 value);

    string internal sharesName;
    string internal sharesSymbol;
    uint256 internal sharesTotalSupply;
    mapping(address => uint256) internal sharesBalances;
    mapping(address => mapping(address => uint256)) internal sharesAllowances;

    // EXTERNAL FUNCTIONS

    /// @dev Standard implementation of ERC20's approve(). Can be overridden.
    function approve(address _spender, uint256 _amount) public virtual returns (bool) {
        __approve(msg.sender, _spender, _amount);
        return true;
    }

    /// @dev Standard implementation of ERC20's transfer(). Can be overridden.
    function transfer(address _recipient, uint256 _amount) public virtual returns (bool) {
        __transfer(msg.sender, _recipient, _amount);
        return true;
    }

    /// @dev Standard implementation of ERC20's transferFrom(). Can be overridden.
    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public virtual returns (bool) {
        __transfer(_sender, _recipient, _amount);
        __approve(
            _sender,
            msg.sender,
            sharesAllowances[_sender][msg.sender].sub(
                _amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    // EXTERNAL FUNCTIONS - VIEW

    /// @dev Standard implementation of ERC20's allowance(). Can be overridden.
    function allowance(address _owner, address _spender) public view virtual returns (uint256) {
        return sharesAllowances[_owner][_spender];
    }

    /// @dev Standard implementation of ERC20's balanceOf(). Can be overridden.
    function balanceOf(address _account) public view virtual returns (uint256) {
        return sharesBalances[_account];
    }

    /// @dev Standard implementation of ERC20's decimals(). Can not be overridden.
    function decimals() public pure returns (uint8) {
        return 18;
    }

    /// @dev Standard implementation of ERC20's name(). Can be overridden.
    function name() public view virtual returns (string memory) {
        return sharesName;
    }

    /// @dev Standard implementation of ERC20's symbol(). Can be overridden.
    function symbol() public view virtual returns (string memory) {
        return sharesSymbol;
    }

    /// @dev Standard implementation of ERC20's totalSupply(). Can be overridden.
    function totalSupply() public view virtual returns (uint256) {
        return sharesTotalSupply;
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper for approve(). Can be overridden.
    function __approve(
        address _owner,
        address _spender,
        uint256 _amount
    ) internal virtual {
        require(_owner != address(0), "ERC20: approve from the zero address");
        require(_spender != address(0), "ERC20: approve to the zero address");

        sharesAllowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    /// @dev Helper to burn tokens from an account. Can be overridden.
    function __burn(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "ERC20: burn from the zero address");

        sharesBalances[_account] = sharesBalances[_account].sub(
            _amount,
            "ERC20: burn amount exceeds balance"
        );
        sharesTotalSupply = sharesTotalSupply.sub(_amount);
        emit Transfer(_account, address(0), _amount);
    }

    /// @dev Helper to mint tokens to an account. Can be overridden.
    function __mint(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "ERC20: mint to the zero address");

        sharesTotalSupply = sharesTotalSupply.add(_amount);
        sharesBalances[_account] = sharesBalances[_account].add(_amount);
        emit Transfer(address(0), _account, _amount);
    }

    /// @dev Helper to transfer tokens between accounts. Can be overridden.
    function __transfer(
        address _sender,
        address _recipient,
        uint256 _amount
    ) internal virtual {
        require(_sender != address(0), "ERC20: transfer from the zero address");
        require(_recipient != address(0), "ERC20: transfer to the zero address");

        sharesBalances[_sender] = sharesBalances[_sender].sub(
            _amount,
            "ERC20: transfer amount exceeds balance"
        );
        sharesBalances[_recipient] = sharesBalances[_recipient].add(_amount);
        emit Transfer(_sender, _recipient, _amount);
    }
}
