pragma solidity ^0.4.21;

import "./Vault.i.sol";
import "../hub/Spoke.sol";
import "../../dependencies/ERC20.sol";
import "../../dependencies/Controlled.sol";


/// @notice Dumb custody component
contract Vault is Controlled, Spoke, VaultInterface {

    bool public locked;

    modifier onlyUnlocked {
        require(!locked);
        _;
    }

    constructor(address _hub, address[] _controllers) Spoke(_hub) Controlled(_controllers) {}

    function lockdown() onlyController {
        locked = true;
    }

    function unlock() onlyController {
        locked = false;
    }

    function deposit(address token, uint amount) {
        ERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(address token, uint amount) onlyController onlyUnlocked {
        ERC20(token).transfer(msg.sender, amount);
    }
}

