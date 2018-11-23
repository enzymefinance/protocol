pragma solidity ^0.4.21;

import "../../dependencies/auth.sol";

/// @notice Generic AssetList
contract AssetList is DSAuth {
    mapping(address => bool) internal list;
    address[] internal mirror;

    constructor(address[] _assets) {
        for (uint i = 0; i < _assets.length; i++) {
            if (!isMember(_assets[i])) { // filter duplicates in _assets
                list[_assets[i]] = true;
                mirror.push(_assets[i]);
            }
        }
    }

    /// @return whether an asset is in the list
    function isMember(address _asset) public view returns (bool) {
        return list[_asset];
    }

    /// @return number of assets specified in the list
    function getMemberCount() external view returns (uint) {
        return mirror.length;
    }

    /// @return array of all listed asset addresses
    function getMembers() external view returns (address[]) { return mirror; }
}
