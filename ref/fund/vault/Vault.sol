pragma solidity ^0.4.21;

import "./Vault.i.sol";
import "../../dependencies/ERC20.sol";
import "../../dependencies/Controlled.sol";


/// @notice Dumb custody component
contract Vault is Controlled, VaultInterface {

    bool public locked;

    modifier onlyUnlocked {
        require(!locked);
        _;
    }

    function Vault(address[] _controllers) Controlled(_controllers) {}

    function lock() onlyController {
        locked = true;
    }

    function unlock() onlyController {
        locked = false;
    }

    function deposit(ERC20 token, uint amount) {
        token.transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(ERC20 token, uint amount) onlyController onlyUnlocked {
        token.transfer(msg.sender, amount);
    }
}

