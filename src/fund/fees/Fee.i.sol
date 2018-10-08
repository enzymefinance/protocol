pragma solidity ^0.4.21;


/// @dev Exposes "amountFor", which maps fund state and fee state to uint
/// @dev Also exposes "updateFor", which changes fee's internal state
interface Fee {
    function amountFor(address hub) public view returns (uint);
    function updateFor(address hub) external;
}

