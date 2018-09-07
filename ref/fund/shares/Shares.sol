pragma solidity ^0.4.21;


import "./Shares.i.sol";
import "../hub/Spoke.sol";
import "../../dependencies/StandardToken.sol";
import "../../dependencies/Controlled.sol";
import "../../factory/Factory.i.sol";

contract Shares is Spoke, Controlled, StandardToken, SharesInterface {

    constructor(address _hub, address[] _controllers) Spoke(_hub) Controlled(_controllers) {}

    function createFor(address who, uint amount) onlyController {
        _mint(who, amount);
    }

    function destroyFor(address who, uint amount) onlyController {
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

contract SharesFactory is FactoryInterface {
    function createInstance(address _hub, address[] _controllers) public returns (address) {
        return new Shares(_hub, _controllers);
    }
}

