pragma solidity ^0.5.13;

import "../Policy.sol";
import "../AddressList.sol";
import "../TradingSignatures.sol";

/// @notice Assets can be removed from but not added to whitelist
contract AssetWhitelist is TradingSignatures, AddressList, Policy {
    constructor(address[] memory _assets) public AddressList(_assets) {}

    function removeFromWhitelist(address _asset) external auth {
        require(isMember(_asset), "Asset not in whitelist");
        delete list[_asset];
        uint i = getAssetIndex(_asset);
        for (i; i < mirror.length-1; i++){
            mirror[i] = mirror[i+1];
        }
        mirror.length--;
    }

    function getAssetIndex(address _asset) public view returns (uint) {
        for (uint i = 0; i < mirror.length; i++) {
            if (mirror[i] == _asset) { return i; }
        }
    }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external view returns (bool) {
        address incomingToken = (sig == TAKE_ORDER) ? addresses[2] : addresses[3];
        return isMember(incomingToken);
    }

    function position() external view returns (Applied) { return Applied.pre; }
    function identifier() external view returns (string memory) { return 'Asset whitelist'; }
}
