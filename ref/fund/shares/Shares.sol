pragma solidity ^0.4.21;

import "../dependencies/ERC20.sol";
import "./Shares.i.sol";


contract Shares is SharesInterface, StandardToken {

    function createFor(address who, uint amount) onlyControllers {
        _mint(who, amount);
    }

    function destroyFor(address who, uint amount) onlyControllers {
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

