pragma solidity ^0.4.21;

/// @notice Token representing proportional ownership in the Fund
interface SharesInterface {
    function createShares(address who, uint amount);
    function annihilateShares(address who, uint amount);

    function getName() view returns (bytes32);
    function getSymbol() view returns (bytes8);
    function getDecimals() view returns (uint);
    function getCreationTime() view returns (uint);
    function toSmallestShareUnit(uint quantity) view returns (uint);
    function toWholeShareUnit(uint quantity) view returns (uint);
}

