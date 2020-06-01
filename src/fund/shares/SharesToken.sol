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

    function transfer(address to, uint amount) public override returns (bool) {
        revert("Unimplemented");
    }

    function transferFrom(
        address from,
        address to,
        uint amount
    )
        public
        override
        returns (bool)
    {
        revert("Unimplemented");
    }

    function approve(address spender, uint amount) public override returns (bool) {
        revert("Unimplemented");
    }

    function increaseApproval(
        address spender,
        uint amount
    )
        public
        override
        returns (bool)
    {
        revert("Unimplemented");
    }

    function decreaseApproval(
        address spender,
        uint amount
    )
        public
        override
        returns (bool)
    {
        revert("Unimplemented");
    }
}
