pragma solidity ^0.4.21;

import "../Policy.sol";
import "../AddressList.sol";

/// @notice Assets can be added but not removed from blacklist
contract AssetBlacklist is AddressList, Policy {
    constructor(address[] _assets) AddressList(_assets) {}

    function addToBlacklist(address _asset) external auth {
        require(!isMember(_asset), "Asset already in blacklist");
        list[_asset] = true;
        mirror.push(_asset);
    }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        return !isMember(addresses[3]);
    }

    function position() external view returns (Applied) { return Applied.pre; }
}
