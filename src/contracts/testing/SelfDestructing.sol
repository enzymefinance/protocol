pragma solidity ^0.4.21;

/// @dev Useful for testing force-sending of funds
contract SelfDestructing {
    function destroy(address _heir) {
        selfdestruct(_heir);
    }
}
