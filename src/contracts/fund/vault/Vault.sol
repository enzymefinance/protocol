pragma solidity ^0.4.25;

import "Vault.i.sol";
import "Spoke.sol";
import "Factory.sol";
import "TokenUser.sol";

/// @notice Dumb custody component
contract Vault is VaultInterface, TokenUser, Spoke {

    constructor(address _hub) Spoke(_hub) {}

    function withdraw(address token, uint amount) external auth {
        safeTransfer(token, msg.sender, amount);
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

