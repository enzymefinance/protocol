pragma solidity 0.6.1;

contract BooleanPolicy {
    enum Applied { pre, post }

    bool allowed;

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external returns (bool) {
        return allowed;
    }

    function position() external pure returns (Applied) { return Applied.pre; }
}

contract TruePolicy is BooleanPolicy {
    constructor() public { allowed = true; }
    function identifier() external pure returns (string memory) { return "TruePolicy"; }
}

contract FalsePolicy is BooleanPolicy {
    constructor() public { allowed = false; }
    function identifier() external pure returns (string memory) { return "FalsePolicy"; }
}
