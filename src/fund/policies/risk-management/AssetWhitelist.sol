pragma solidity 0.6.8;

import "../AddressList.sol";
import "../TradingSignatures.sol";

/// @title AssetWhitelist Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Assets can be removed from but not added to whitelist
contract AssetWhitelist is TradingSignatures, AddressList {
    enum Applied { pre, post }

    constructor(address[] memory _assets) public AddressList(_assets) {}

    function removeFromWhitelist(address _asset) external auth {
        require(isMember(_asset), "Asset not in whitelist");
        delete list[_asset];
        uint i = getAssetIndex(_asset);
        for (i; i < mirror.length-1; i++){
            mirror[i] = mirror[i+1];
        }
        mirror.pop();
    }

    function getAssetIndex(address _asset) public view returns (uint) {
        for (uint i = 0; i < mirror.length; i++) {
            if (mirror[i] == _asset) { return i; }
        }
    }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external returns (bool) {
        if (sig != TAKE_ORDER) revert("Signature was not TakeOrder");
        address incomingToken = addresses[2];
        return isMember(incomingToken);
    }

    function position() external pure returns (Applied) { return Applied.pre; }
    function identifier() external pure returns (string memory) { return 'AssetWhitelist'; }
}
