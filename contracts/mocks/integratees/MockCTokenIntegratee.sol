// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../MockToken.sol";

contract MockCTokenIntegratee is MockToken {
    address public immutable UNDERLYING;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _underlying
    ) public MockToken(_name, _symbol, _decimals) {
        UNDERLYING = _underlying;
    }

    receive() external payable {}

    function underlying() public view returns (address) {
        return UNDERLYING;
    }
}
