pragma solidity ^0.4.21;

import "Policy.sol";
import "AddressList.sol";
import "TradingSignatures.sol";

/// @notice Assets can be added but not removed from blacklist
contract AssetBlacklist is TradingSignatures, AddressList, Policy {

    // bytes4 constant public MAKE_ORDER = 0x79705be7; // makeOrderSignature
    // bytes4 constant public TAKE_ORDER = 0xe51be6e8; // takeOrderSignature

    constructor(address[] _assets) AddressList(_assets) {}

    function addToBlacklist(address _asset) external auth {
        require(!isMember(_asset), "Asset already in blacklist");
        list[_asset] = true;
        mirror.push(_asset);
    }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        address incomingToken = (sig == TAKE_ORDER) ? addresses[2] : addresses[3];
        return !isMember(incomingToken);
    }

    function position() external view returns (Applied) { return Applied.pre; }
}
