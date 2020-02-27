pragma solidity 0.6.1;

import "../../accounting/IAccounting.sol";
import "../../hub/Hub.sol";
import "../../trading/Trading.sol";
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
        IAccounting accounting = IAccounting(Hub(Trading(msg.sender).hub()).accounting());
        address denominationAsset = accounting.DENOMINATION_ASSET();
        // Always allow a trade INTO the quote asset
        address incomingToken = addresses[2];
        if (denominationAsset == incomingToken) return true;
        return accounting.getOwnedAssetsLength() <= maxPositions;
    }

    function position() external pure returns (Applied) { return Applied.post; }
    function identifier() external pure returns (string memory) { return 'MaxPositions'; }
}
