// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./../../../release/interfaces/ISynthetixAddressResolver.sol";

contract MockSynthetixAddressResolver is ISynthetixAddressResolver {
    mapping(bytes32 => address) public addresses;

    constructor() public {}

    function setAddress(bytes32 name, address addr) external {
        addresses[name] = addr;
    }

    function requireAndGetAddress(bytes32 name, string calldata reason)
        external
        view
        override
        returns (address addr)
    {
        addr = addresses[name];
        require(addr != address(0), reason);

        return addr;
    }
}
