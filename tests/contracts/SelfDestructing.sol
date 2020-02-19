pragma solidity 0.6.1;

/// @dev Useful for testing force-sending of funds
contract SelfDestructing {
    function bequeath(address payable _heir) public {
        selfdestruct(_heir);
    }

    receive() external payable {}
}
