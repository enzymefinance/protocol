pragma solidity ^0.4.21;

import "./Policy.sol";

contract BooleanPolicy is Policy {
    bool allowed;

    function rule() external view returns (bool) {
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
