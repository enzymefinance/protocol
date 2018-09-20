pragma solidity ^0.4.21;


import "./Vault.i.sol";
import "../hub/Spoke.sol";
import "../../dependencies/ERC20.sol";
import "../../factory/Factory.i.sol";

/// @notice Dumb custody component
contract Vault is Spoke, VaultInterface {

    bool public locked;

    modifier onlyUnlocked {
        require(!locked);
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

contract VaultFactory is FactoryInterface {
    function createInstance(address _hub) public returns (address) {
        return new Vault(_hub);
    }
}

