pragma solidity ^0.4.21;

/// @notice Gives metrics about a Fund
interface Accounting {
    function NAV() view returns (uint);
    function GAV() view returns (uint);
    function sharePrice() view returns (uint);
}
