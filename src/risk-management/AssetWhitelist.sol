pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../Fund.sol";
import "./AssetList.sol";

// AssetWhitelist policy is run as a pre-condition
contract AssetWhitelist is AssetList, Policy {

  function AssetWhitelist(address[] _addresses) AssetList(_addresses) public {

  }

  //Ability to REMOVE an asset FROM the whitelist
  function removeFromWhitelist(address _asset) external pre_cond(isOwner()) {
    //ensure asset is already a member
    require(isMember(_asset));

    //remove from list mapping
    delete list[_asset];

    //remove from mirror and tidy up
    uint i = getAssetIndex(_asset);
    for (i; i < mirror.length-1; ++i){
      mirror[i] = mirror[i+1];
    }
    mirror.length--;
  }

  function getAssetIndex(address _asset) public view returns (uint) {
    for (uint i = 0; i < mirror.length; ++i) {
      if (mirror[i] == _asset) {
        return i;
      }
    }
  }

  //The actual Risk Engineering Rule
  function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
    return isMember(addresses[3]);
  }

  //Specify that all whitelist policy checks are pre-conditions (0)
  function position() external view returns (uint) {
      //PRE-condition
      //return Conditionality.pre;
      return uint(Conditionality.pre);
  }
}
