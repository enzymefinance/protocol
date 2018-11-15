pragma solidity ^0.4.21;


import "./Vault.i.sol";
import "../hub/Spoke.sol";
import "../../dependencies/token/ERC20.i.sol";
import "../../factory/Factory.sol";

/// @notice Dumb custody component
contract Vault is Spoke, VaultInterface {

    bool public locked;

    modifier onlyUnlocked {
        require(!locked, "Vault is locked");
        _;
    }

    constructor(address _hub) Spoke(_hub) {}

    function lockdown() auth {
        locked = true;
    }

    function unlock() auth {
        locked = false;
    }

    // TODO: evaluate whether we need this function, or can just deposit as normal
    function deposit(address token, uint amount) auth {
        ERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(address token, uint amount) onlyUnlocked auth {
        ERC20(token).transfer(msg.sender, amount);
    }
}

contract VaultFactory is Factory {
    function createInstance(address _hub) public returns (address) {
        address vault = new Vault(_hub);
        childExists[vault] = true;
        InstanceCreated(vault);
        return vault;
    }
}

