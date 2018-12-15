pragma solidity ^0.4.21;

import "auth.sol";
import "Policy.sol";

contract UserWhitelist is Policy, DSAuth {

    event ListAddition(address indexed who);
    event ListRemoval(address indexed who);

    mapping (address => bool) whitelisted;

    function UserWhitelist(address[] _preApproved) public {
        batchAddToWhitelist(_preApproved);
    }

    function addToWhitelist(address _who) public auth {
        whitelisted[_who] = true;
        emit ListAddition(_who);
    }

    function removeFromWhitelist(address _who) public auth {
        whitelisted[_who] = false;
        emit ListAddition(_who);
    }

    function batchAddToWhitelist(address[] _members) public auth {
        for (uint i = 0; i < _members.length; i++) {
            addToWhitelist(_members[i]);
        }
    }

    function batchRemoveFromWhitelist(address[] _members) public auth {
        for (uint i = 0; i < _members.length; i++) {
            removeFromWhitelist(_members[i]);
        }
    }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        return whitelisted[addresses[0]];
    }

    function position() external view returns (Applied) { return Applied.pre; }
}

