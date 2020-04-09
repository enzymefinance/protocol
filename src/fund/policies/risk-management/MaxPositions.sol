pragma solidity 0.6.4;

import "../../hub/Spoke.sol";
import "../../shares/Shares.sol";
import "../../vault/Vault.sol";
import "../TradingSignatures.sol";

contract MaxPositions is TradingSignatures {
    enum Applied { pre, post }

    uint public maxPositions;

    /// @dev _maxPositions = 10 means max 10 different asset tokens
    /// @dev _maxPositions = 0 means no asset tokens are investable
    constructor(uint _maxPositions) public { maxPositions = _maxPositions; }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier)
        external
        returns (bool)
    {
        if (sig != TAKE_ORDER) revert("Signature was not TakeOrder");
        IHub hub = IHub(Spoke(msg.sender).getHub());
        // Always allow a trade INTO the quote asset
        address incomingToken = addresses[2];
        if (Shares(hub.shares()).DENOMINATION_ASSET() == incomingToken) return true;
        return Vault(payable(hub.vault())).getOwnedAssetsLength() <= maxPositions;
    }

    function position() external pure returns (Applied) { return Applied.post; }
    function identifier() external pure returns (string memory) { return 'MaxPositions'; }
}
