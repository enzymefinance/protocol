pragma solidity ^0.5.13;

import "../../../dependencies/auth.sol";
import "../Policy.sol";

contract UserWhitelist is Policy, DSAuth {

    event ListAddition(address indexed who);
    event ListRemoval(address indexed who);

    mapping (address => bool) public whitelisted;

    constructor(address[] memory _preApproved) public {
        batchAddToWhitelist(_preApproved);
    }

    function addToWhitelist(address _who) public auth {
        whitelisted[_who] = true;
        emit ListAddition(_who);
    }

    function removeFromWhitelist(address _who) public auth {
        whitelisted[_who] = false;
        emit ListRemoval(_who);
    }

    function batchAddToWhitelist(address[] memory _members) public auth {
        for (uint i = 0; i < _members.length; i++) {
            addToWhitelist(_members[i]);
        }
    }

    function batchRemoveFromWhitelist(address[] memory _members) public auth {
        for (uint i = 0; i < _members.length; i++) {
            removeFromWhitelist(_members[i]);
        }
    }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external view returns (bool) {
        return whitelisted[addresses[0]];
    }

    function position() external view returns (Applied) { return Applied.pre; }
    function identifier() external view returns (string memory) { return 'UserWhitelist'; }
}

