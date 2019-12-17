pragma solidity ^0.5.13;

import "./Vault.i.sol";
import "../hub/Spoke.sol";
import "../../factory/Factory.sol";
import "../../dependencies/TokenUser.sol";

/// @notice Dumb custody component
contract Vault is IVault, TokenUser, Spoke {

    constructor(address _hub) public Spoke(_hub) {}

    function withdraw(address token, uint amount) external auth {
        safeTransfer(token, msg.sender, amount);
    }
}

contract VaultFactory is IVaultFactory, Factory {
    function createInstance(address _hub) external returns (address) {
        address vault = address(new Vault(_hub));
        childExists[vault] = true;
        emit NewInstance(_hub, vault);
        return vault;
    }
}

