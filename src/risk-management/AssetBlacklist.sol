pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../Fund.sol";
import "./AssetList.sol";

// AssetBlacklist policy is run as a pre-condition
contract AssetBlacklist is AssetList, Policy {

  function AssetBlacklist(address[] _addresses) AssetList(_addresses) public {

  }

  //Ability to ADD an asset TO the blacklist
  function addToBlacklist(address _asset) external pre_cond(isOwner()) {
    //ensure asset is not already a member
    require(!isMember(_asset));
    //add to list and mirror
    list[_asset] = true;
    mirror.push(_asset);
  }

  //The actual Risk Engineering Rule
  function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
      return !isMember(addresses[3]);
  }

  //Specify that all black- and whitelist policy checks are pre-conditions (0)
  function position() external view returns (uint) {
      //PRE-condition
      return uint(Conditionality.pre);
  }
}
