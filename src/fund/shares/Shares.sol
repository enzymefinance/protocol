pragma solidity ^0.4.21;


import "./Shares.i.sol";
import "../hub/Spoke.sol";
import "../../dependencies/StandardToken.sol";
import "../../factory/Factory.sol";

contract Shares is Spoke, StandardToken, SharesInterface {

    constructor(address _hub) Spoke(_hub) {}

    function createFor(address who, uint amount) auth {
        _mint(who, amount);
    }

    function destroyFor(address who, uint amount) auth {
        _burn(who, amount);
    }

    function transfer(address to, uint amount) public returns (bool) {
        revert();
    }

    function transferFrom(
        address from,
        address to,
        uint amount
    )
        public
        returns (bool)
    {
        revert();
    }

    function approve(address spender, uint amount) public returns (bool) {
        revert();
    }

    function increaseApproval(
        address spender,
        uint amount
    )
        public
        returns (bool)
    {
        revert();
    }

    function decreaseApproval(
        address spender,
        uint amount
    )
        public
        returns (bool)
    {
        revert();
    }
}

contract SharesFactory is Factory {
    function createInstance(address _hub) public returns (address) {
        address shares = new Shares(_hub);
        childExists[shares] = true;
        return shares;
    }
}

