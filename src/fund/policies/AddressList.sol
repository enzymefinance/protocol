pragma solidity 0.6.1;

import "../../dependencies/DSAuth.sol";

/// @notice Generic AddressList
contract AddressList is DSAuth {

    event ListAddition(address[] ones);

    mapping(address => bool) internal list;
    address[] internal mirror;

    constructor(address[] memory _assets) public {
        for (uint i = 0; i < _assets.length; i++) {
            if (!isMember(_assets[i])) { // filter duplicates in _assets
                list[_assets[i]] = true;
                mirror.push(_assets[i]);
            }
        }
        emit ListAddition(_assets);
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
    function getMembers() external view returns (address[] memory) { return mirror; }
}
