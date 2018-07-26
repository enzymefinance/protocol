pragma solidity ^0.4.21;

import "../dependencies/Owned.sol";

// Generic AssetList
contract AssetList is Owned {

    mapping(address => bool)  private list;
    address[]                 private mirror;
    bool                      private frozen;
    uint                      private cap; //Max number of whitelisted assets; implicit cap for distinct fund holdings
    //NOTE: assetUnivCap < MaxPositions would be nonsensical
    //NOTE: assetUnivCap <= asset number in AssetRegistrar
    //NOTE: if specified, assetUnivCap must >= 2
    //NOTE: if not specified, assetUnivCap defaults to 0

    // TODO modifier "isAppendable"

    // TODO modifier "isRemovable"

    // Constructor, set max size of listed
    // cap = 0 => unlimited
    function AssetList(uint _cap) public {
        require(_cap != 1);
        cap = _cap;
    }
    
    function register(address _asset) external pre_cond(isOwner()) {
      require(!isFrozen());
      require(!exists(_asset));
      require(cap != 0 && mirror.length < cap);
      
      list[_asset] = true;
      mirror.push(_asset);
    }
    
    function exists(address _asset) public view returns (bool) {
      return list[_asset];
    }

    //Permanently freezes the list members
    function freeze() external pre_cond(isOwner()) {
        if (!frozen) {
          frozen = true;
        }
    }

    //check if the list is frozen
    function isFrozen() public view returns (bool) {
        return frozen;
    }

    //returns the current number of assets specified on the list
    function getNumList() external view returns (uint) {
      return mirror.length;
    }

    //returns the set maximum number of assets for the fund's investment universe
    function getCap() external view returns (uint) {
      return cap;
    }

    //returns an array of all listed asset addresses
    function getList() external view returns (address[]) {
      return mirror;
    }

    //TBD
    //function removeFromList(address _asset) public {}
}
