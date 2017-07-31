pragma solidity ^0.4.11;

import "./DBC.sol";
import "./Owned.sol";

// only Owner is able to give and revoke permissions
contract Permissioned is DBC, Owned {
    mapping (address => bool) public permitted;

    function isPermitted(address query) returns(bool) {
        return permitted[query];
    }

    function senderPermitted() returns(bool) {
        return isPermitted(msg.sender);
    }

    // TODO: remove tx.origin in favour of some other mechanism (for Serenity)
    function ownerOrigin() returns(bool) {
        return tx.origin == owner;
    }

    function addPermission(address entry) pre_cond(isOwner() || ownerOrigin()) {
        permitted[entry] = true;
    }

    function removePermission(address entry) pre_cond(isOwner() || ownerOrigin()) {
        permitted[entry] = false;
    }

    // Constructor
    function Permissioned() {
        addPermission(msg.sender); // owner permitted by default
    }
}
