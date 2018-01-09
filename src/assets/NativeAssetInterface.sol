pragma solidity ^0.4.19;

import "../assets/AssetInterface.sol";

/// @title Native Asset Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Native asset is defined as the asset used to pay for gas on a blockchain
contract NativeAssetInterface is AssetInterface {

    function deposit() public payable {}
    function withdraw(uint wad) public {}
}
