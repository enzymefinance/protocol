// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SharesToken Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Implementation of a share
contract SharesToken is ERC20 {
    constructor(string memory _name) public ERC20(_name, "MLNF") {}

    function transfer(address, uint256) public override returns (bool) {
        revert("Unimplemented");
    }

    function transferFrom(
        address,
        address,
        uint256
    )
        public
        override
        returns (bool)
    {
        revert("Unimplemented");
    }

    function approve(address, uint256) public override returns (bool) {
        revert("Unimplemented");
    }

    function increaseAllowance(
        address,
        uint256
    )
        public
        override
        returns (bool)
    {
        revert("Unimplemented");
    }

    function decreaseAllowance(
        address,
        uint256
    )
        public
        override
        returns (bool)
    {
        revert("Unimplemented");
    }
}
