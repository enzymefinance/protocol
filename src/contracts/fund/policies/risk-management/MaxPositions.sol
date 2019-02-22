pragma solidity ^0.4.25;

import "PriceSource.i.sol";
import "Accounting.sol";
import "Policy.sol";
import "Trading.sol";
import "TradingSignatures.sol";

contract MaxPositions is TradingSignatures, Policy {
    uint public maxPositions;

    /// @dev _maxPositions = 10 means max 10 different asset tokens
    /// @dev _maxPositions = 0 means no asset tokens are investable
    constructor(uint _maxPositions) { maxPositions = _maxPositions; }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier)
        external
        view
        returns (bool)
    {
        Accounting accounting = Accounting(Hub(Trading(msg.sender).hub()).accounting());
        address denominationAsset = accounting.DENOMINATION_ASSET();
        // Always allow a trade INTO the quote asset
        address incomingToken = (sig == TAKE_ORDER) ? addresses[2] : addresses[3];
        if (denominationAsset == incomingToken) { return true; }
        return accounting.getOwnedAssetsLength() <= maxPositions;
    }

    function position() external view returns (Applied) { return Applied.post; }
    function identifier() external view returns (string) { return 'Max positions'; }
}
