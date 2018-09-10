pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../Fund.sol";
import "./AssetList.sol";


// AssetBlacklist policy is run as a pre-condition
contract AssetBlacklist is AssetList, Policy {
  // Constructor, set max size of listed
  // cap = 0 => unlimited
  function AssetBlacklist(uint _cap) AssetList(_cap) public {

  }

  //The actual Risk Engineering Rule
  function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
      return !exists(addresses[3]);
  }
  //Specify that all black- and whitelist policy checks are pre-conditions (0)
  function position() external view returns (uint) {
      //PRE-condition
      return 0;
  }

}
