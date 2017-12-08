pragma solidity ^0.4.17;

import '../assets/AssetInterface.sol';

/// @title Asset Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Asset Contract
/// @notice This extends the ERC20 Interface
contract SharesInterface is AssetInterface {

    // VIEW METHODS

    function getName() view returns (string) {}
    function getSymbol() view returns (string) {}
    function getDecimals() view returns (uint) {}
    function getCreationTime() view returns (uint) {}
    function toSmallestShareUnit(uint quantity) view returns (uint) {}
    function toWholeShareUnit(uint quantity) view returns (uint) {}

}
