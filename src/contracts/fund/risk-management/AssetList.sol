pragma solidity ^0.4.21;

import "../../dependencies/auth.sol";

/// @notice Generic AssetList
contract AssetList is DSAuth {

    mapping(address => bool) internal list;
    address[] internal mirror;

    constructor(address[] _addresses) {
        for (uint i = 0; i < _addresses.length; ++i) {
            //ensure no duplicates in _addresses
            if (!isMember(_addresses[i])) {
                list[_addresses[i]] = true;
                mirror.push(_addresses[i]);
            }
        }
    }

    //returns asset member status in list
    function isMember(address _asset) public view returns (bool) {
        return list[_asset];
    }

    //returns the current number of assets specified on the list
    function getMemberCount() external view returns (uint) {
        return mirror.length;
    }

    //returns an array of all listed asset addresses
    function getMembers() external view returns (address[]) {
        return mirror;
    }
}
