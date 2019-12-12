pragma solidity ^0.5.13;

import "./Policy.sol";

contract BooleanPolicy is Policy {
    bool allowed;

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        return allowed;
    }

    function position() external view returns (Applied) { return Applied.pre; }
}

contract TruePolicy is BooleanPolicy {
    constructor() public { allowed = true; }
    function identifier() external view returns (string) { "TruePolicy"; }
}

contract FalsePolicy is BooleanPolicy {
    constructor() public { allowed = false; }
    function identifier() external view returns (string) { "FalsePolicy"; }
}
