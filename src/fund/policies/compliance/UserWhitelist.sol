pragma solidity 0.6.1;

import "../../../dependencies/DSAuth.sol";

contract UserWhitelist is DSAuth {
    enum Applied { pre, post }

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

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external returns (bool) {
        return whitelisted[addresses[0]];
    }

    function position() external pure returns (Applied) { return Applied.pre; }
    function identifier() external pure returns (string memory) { return 'UserWhitelist'; }
}
