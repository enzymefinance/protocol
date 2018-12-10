pragma solidity ^0.4.21;

import "auth.sol";
import "Policy.sol";

// TODO: permissioning details when integrated with fund (which entities can change things)
// TODO: template rule; remove this one if not useful
contract UserBlacklist is Policy, DSAuth {

    event ListAddition(address indexed who);
    event ListRemoval(address indexed who);

    mapping (address => bool) blacklisted;

    function UserBlacklist(address[] _preBlacklisted) public {
        batchAddToBlacklist(_preBlacklisted);
    }

    function addToBlacklist(address _who) public auth {
        blacklisted[_who] = true;
        emit ListAddition(_who);
    }

    function removeFromBlacklist(address _who) public auth {
        blacklisted[_who] = false;
        emit ListRemoval(_who);
    }

    function batchAddToBlacklist(address[] _members) public auth {
        for (uint i = 0; i < _members.length; i++) {
            addToBlacklist(_members[i]);
        }
    }

    function batchRemoveFromBlacklist(address[] _members) public auth {
        for (uint i = 0; i < _members.length; i++) {
            removeFromBlacklist(_members[i]);
        }
    }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        return !blacklisted[addresses[0]];
    }

    function position() external view returns (Applied) { return Applied.pre; }
}

