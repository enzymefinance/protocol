pragma solidity ^0.4.21;


import "./Factory.i.sol";
import "../fund/vault/Vault.sol";

contract VaultFactory is FactoryInterface {
    function createInstance(address _hub, address[] _controllers) public returns (address) {
        return new Vault(_hub, _controllers);
    }
}

