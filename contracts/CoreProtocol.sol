pragma solidity ^0.4.8;

import "./assets/AssetProtocol.sol";

/// @title Core Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Core Contract
contract CoreProtocol is AssetProtocol {
  function getReferenceAsset() constant returns (address) {}
  function getUniverseAddress() constant returns (address) {}
  function getSharePrice() constant returns (uint) {}
}
