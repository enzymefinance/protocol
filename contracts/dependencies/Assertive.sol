pragma solidity ^0.4.2;

contract Assertive {
    function assert(bool assertion) internal {
        if (!assertion) throw;
    }
}
