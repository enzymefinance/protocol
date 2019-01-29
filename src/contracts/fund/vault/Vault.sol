pragma solidity ^0.4.21;

import "Vault.i.sol";
import "Spoke.sol";
import "ERC20.i.sol";
import "Factory.sol";

/// @notice Dumb custody component
contract Vault is VaultInterface, Spoke {

    constructor(address _hub) Spoke(_hub) {}

    function withdraw(address token, uint amount) external auth {
        ERC20(token).transfer(msg.sender, amount);
    }
}

contract VaultFactory is Factory {
    function createInstance(address _hub) external returns (address) {
        address vault = new Vault(_hub);
        childExists[vault] = true;
        NewInstance(_hub, vault);
        return vault;
    }
}

