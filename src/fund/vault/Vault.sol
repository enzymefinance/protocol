pragma solidity 0.6.1;

import "../hub/Spoke.sol";
import "../../factory/Factory.sol";
import "../../dependencies/TokenUser.sol";

/// @notice Dumb custody component
contract Vault is TokenUser, Spoke {

    constructor(address _hub) public Spoke(_hub) {}

    function withdraw(address token, uint amount) external auth {
        safeTransfer(token, msg.sender, amount);
    }
}

contract VaultFactory is Factory {
    function createInstance(address _hub) external returns (address) {
        address vault = address(new Vault(_hub));
        childExists[vault] = true;
        emit NewInstance(_hub, vault);
        return vault;
    }
}

