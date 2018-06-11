pragma solidity ^0.4.21;

import "./Policy.sol";

contract BooleanPolicy is Policy {
    bool allowed;

    function rule(address[4] addresses, uint[2] values) external view returns (bool) {
        return allowed;
    }
}

contract TruePolicy is BooleanPolicy {
    constructor() public {
        allowed = true;
    }
}

contract FalsePolicy is BooleanPolicy {
    constructor() public {
        allowed = false;
    }
}
