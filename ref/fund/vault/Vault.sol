pragma solidity ^0.4.21;

import "./Vault.i.sol";
import "../dependencies/ERC20.sol";
import "../dependencies/Owned.sol";


/// @notice Custody component
contract Vault is Controlled, VaultInterface {

    bool public locked;

    modifier onlyUnlocked {
        require(!locked);
        _;
    }

    function lock() {
        locked = true;
    }

    function unlock() {
        locked = false;
    }

    function deposit(ERC20 token, uint amount) {
        token.transfer(address(this), amount);
    }

    function withdraw(ERC20 token, uint amount) onlyControllers onlyUnlocked {
        token.transfer(msg.sender, amount);
    }

    // TODO: implement (if needed!)
    function addAssetToOwnedAssets (address ofAsset);
}

