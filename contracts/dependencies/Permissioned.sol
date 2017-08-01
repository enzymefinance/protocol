pragma solidity ^0.4.11;

import "./DBC.sol";
import "./Owned.sol";

// only Owner is able to give and revoke permissions
contract Permissioned is DBC, Owned {
    mapping (address => bool) public permitted;

    function isPermitted(address query) constant returns (bool) {
        return permitted[query];
    }

    function senderPermitted() constant returns (bool) {
        return isPermitted(msg.sender);
    }

    function addPermission(address entry) pre_cond(isOwner()) {
        permitted[entry] = true;
    }

    function removePermission(address entry) pre_cond(isOwner()) {
        permitted[entry] = false;
    }
}
