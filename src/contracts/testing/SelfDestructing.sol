pragma solidity ^0.4.25;

/// @dev Useful for testing force-sending of funds
contract SelfDestructing {
    function bequeath(address _heir) public {
        selfdestruct(_heir);
    }

    function () public payable {}
}
