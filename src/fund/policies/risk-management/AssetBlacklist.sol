pragma solidity 0.6.1;

import "../AddressList.sol";
import "../TradingSignatures.sol";

/// @notice Assets can be added but not removed from blacklist
contract AssetBlacklist is TradingSignatures, AddressList {
    enum Applied { pre, post }

    // bytes4 constant public MAKE_ORDER = 0x79705be7; // makeOrderSignature
    // bytes4 constant public TAKE_ORDER = 0xe51be6e8; // takeOrderSignature

    constructor(address[] memory _assets) AddressList(_assets) public {}

    function addToBlacklist(address _asset) external auth {
        require(!isMember(_asset), "Asset already in blacklist");
        list[_asset] = true;
        mirror.push(_asset);
    }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external returns (bool) {
        address incomingToken = (sig == TAKE_ORDER) ? addresses[2] : addresses[3];
        return !isMember(incomingToken);
    }

    function position() external pure returns (Applied) { return Applied.pre; }
    function identifier() external pure returns (string memory) { return 'AssetBlacklist'; }
}
