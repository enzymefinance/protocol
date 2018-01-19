pragma solidity ^0.4.19;

import "../assets/AssetInterface.sol";

/// @title Native Asset Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Native asset is defined as the native currency converted into erc20 compatible asset
/// @notice Native currency is defined as the unit of exchange used to pay of gas on a blockchain
contract NativeAssetInterface is AssetInterface {

    // PUBLIC METHODS
    function deposit() public payable {}
    function withdraw(uint wad) public {}
}
