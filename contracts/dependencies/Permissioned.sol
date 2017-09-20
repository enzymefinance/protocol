pragma solidity ^0.4.11;

import './DBC.sol';
import './Owned.sol';

/// @dev Admins can give/revoke permissions
/// @dev Contract creator is first admin
/// @dev Admins can add admins, and can never lose their admin rights
/// @dev All admins also have permissions
contract Permissioned is DBC {
    mapping (address => bool) public admins;
    mapping (address => bool) public permitted;

    function isAdmin(address query) constant returns (bool) {
        return admins[query];
    }

    function isPermitted(address query) constant returns (bool) {
        return permitted[query] || admins[query];
    }

    function senderPermitted() constant returns (bool) {
        return isPermitted(msg.sender);
    }

    function addAdmin(address addr) pre_cond(isAdmin(msg.sender)) {
        admins[addr] = true;
    }

    function addPermission(address entry) pre_cond(isAdmin(msg.sender)) {
        permitted[entry] = true;
    }

    function removePermission(address entry) pre_cond(isAdmin(msg.sender)) {
        permitted[entry] = false;
    }

    function Permissioned() {
        admins[msg.sender] = true;
    }
}
