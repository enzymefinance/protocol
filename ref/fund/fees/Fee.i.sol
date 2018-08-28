pragma solidity ^0.4.21;


/// @dev Fees expose one method "calculate", that maps state to uint
/// @dev a Fee itself can have state, which it updates during "calculate"
interface Fee {
    function calculate(address hub) external returns (uint);
}

