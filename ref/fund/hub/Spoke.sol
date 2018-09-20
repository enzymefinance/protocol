pragma solidity ^0.4.21;


import "./Hub.sol";
import "../../../src/dependencies/auth.sol";

// TODO: ACL consumption may be better placed in each component; evaluate this
/// @notice Has one Hub
contract Spoke is DSAuth {
    Hub public hub;

    constructor(address _hub) {
        hub = Hub(_hub);
        setAuthority(hub);
    }
}

