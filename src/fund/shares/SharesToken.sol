pragma solidity 0.6.1;

import "../../dependencies/DSAuth.sol";
import "../../dependencies/token/StandardToken.sol";

contract SharesToken is DSAuth, StandardToken {
    string public symbol;
    string public name;
    uint8 public decimals;

    constructor(string memory _name) public {
        name = _name;
        symbol = "MLNF";
        decimals = 18;
    }

    function createFor(address who, uint amount) external auth {
        _mint(who, amount);
    }

    function destroyFor(address who, uint amount) external auth {
        _burn(who, amount);
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
