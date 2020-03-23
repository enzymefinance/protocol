pragma solidity 0.6.4;

import "../AddressList.sol";
import "../TradingSignatures.sol";

/// @notice Assets can be added but not removed from blacklist
contract AssetBlacklist is TradingSignatures, AddressList {
    enum Applied { pre, post }

    constructor(address[] memory _assets) AddressList(_assets) public {}

    function addToBlacklist(address _asset) external auth {
        require(!isMember(_asset), "Asset already in blacklist");
        list[_asset] = true;
        mirror.push(_asset);
    }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external returns (bool) {
        if (sig != TAKE_ORDER) revert("Signature was not TakeOrder");
        address incomingToken = addresses[2];
        return !isMember(incomingToken);
    }

    function position() external pure returns (Applied) { return Applied.pre; }
    function identifier() external pure returns (string memory) { return 'AssetBlacklist'; }
}
