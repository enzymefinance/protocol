pragma solidity ^0.4.21;

/// @title Native Asset Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Native asset is defined as the native currency converted into erc20 compatible asset
/// @notice Native currency is defined as the unit of exchange used to pay of gas on a blockchain
interface NativeAssetInterface {

    // PUBLIC METHODS
    function deposit() public payable;
    function withdraw(uint wad) public;
}
