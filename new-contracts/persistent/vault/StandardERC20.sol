// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title StandardERC20 Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Contains the storage, events, and default logic of an ERC20-compliant contract.
/// @dev The logic can (and likely should) be overridden by VaultLib implementations.
/// Adapted from OpenZeppelin.
contract StandardERC20 is IERC20 {
    using SafeMath for uint256;

    string internal nameInternal;
    string internal symbolInternal;
    uint8 internal decimalsInternal;
    uint256 internal totalSupplyInternal;
    mapping(address => uint256) internal balancesInternal;
    mapping(address => mapping(address => uint256)) internal allowancesInternal;

    // EXTERNAL FUNCTIONS

    function approve(address _spender, uint256 _amount) public virtual override returns (bool) {
        __approve(msg.sender, _spender, _amount);
        return true;
    }

    function transfer(address _recipient, uint256 _amount) public virtual override returns (bool) {
        __transfer(msg.sender, _recipient, _amount);
        return true;
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public virtual override returns (bool) {
        __transfer(_sender, _recipient, _amount);
        __approve(
            _sender,
            msg.sender,
            allowancesInternal[_sender][msg.sender].sub(
                _amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    // EXTERNAL FUNCTIONS - VIEW

    function allowance(address _owner, address _spender)
        public
        virtual
        override
        view
        returns (uint256)
    {
        return allowancesInternal[_owner][_spender];
    }

    function name() public virtual view returns (string memory) {
        return nameInternal;
    }

    function symbol() public virtual view returns (string memory) {
        return symbolInternal;
    }

    function decimals() public view returns (uint8) {
        return decimalsInternal;
    }

    function totalSupply() public virtual override view returns (uint256) {
        return totalSupplyInternal;
    }

    function balanceOf(address _account) public virtual override view returns (uint256) {
        return balancesInternal[_account];
    }

    // INTERNAL FUNCTIONS

    function __approve(
        address _owner,
        address _spender,
        uint256 _amount
    ) internal virtual {
        require(_owner != address(0), "ERC20: approve from the zero address");
        require(_spender != address(0), "ERC20: approve to the zero address");

        allowancesInternal[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function __burn(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "ERC20: burn from the zero address");

        balancesInternal[_account] = balancesInternal[_account].sub(
            _amount,
            "ERC20: burn amount exceeds balance"
        );
        totalSupplyInternal = totalSupplyInternal.sub(_amount);
        emit Transfer(_account, address(0), _amount);
    }

    function __mint(address _account, uint256 _amount) internal virtual {
        require(_account != address(0), "ERC20: mint to the zero address");

        totalSupplyInternal = totalSupplyInternal.add(_amount);
        balancesInternal[_account] = balancesInternal[_account].add(_amount);
        emit Transfer(address(0), _account, _amount);
    }

    function __transfer(
        address _sender,
        address _recipient,
        uint256 _amount
    ) internal virtual {
        require(_sender != address(0), "ERC20: transfer from the zero address");
        require(_recipient != address(0), "ERC20: transfer to the zero address");

        balancesInternal[_sender] = balancesInternal[_sender].sub(
            _amount,
            "ERC20: transfer amount exceeds balance"
        );
        balancesInternal[_recipient] = balancesInternal[_recipient].add(_amount);
        emit Transfer(_sender, _recipient, _amount);
    }
}
