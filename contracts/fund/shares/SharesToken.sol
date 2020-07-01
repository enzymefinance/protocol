// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../dependencies/token/StandardToken.sol";

/// @title SharesToken Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Implementation of a share
contract SharesToken is StandardToken {
    string public symbol;
    string public name;
    uint8 public decimals;

    constructor(string memory _name) public {
        name = _name;
        symbol = "MLNF";
        decimals = 18;
    }

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

    function increaseApproval(
        address,
        uint256
    )
        public
        override
        returns (bool)
    {
        revert("Unimplemented");
    }

    function decreaseApproval(
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
