pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../Fund.sol";
import "./AssetList.sol";


// AssetWhitelist policy is run as a pre-condition
contract AssetWhitelist is AssetList, Policy {

  function AssetWhitelist(uint _cap) public {
    AssetList(_cap);
  }
  //The actual Risk Engineering Rule
  function rule(address[4] addresses, uint[2] values) external view returns (bool) {
    return exists(addresses[3]);
  }
}
