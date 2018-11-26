pragma solidity ^0.4.21;

import "../../../prices/PriceSource.i.sol";
import "../../accounting/Accounting.sol";
import "../../policies/Policy.sol";
import "../../trading/Trading.sol";

contract MaxPositions is Policy {
    uint public maxPositions;

    /// @dev _maxPositions = 10 means max 10 different non-quote asset tokens
    /// @dev _maxPositions = 0 means no non-quote asset tokens are investable
    constructor(uint _maxPositions) { maxPositions = _maxPositions; }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier)
        external
        view
        returns (bool)
    {
        address pricefeed = Hub(Trading(msg.sender).hub()).priceSource();
        address quoteAsset = PriceSourceInterface(pricefeed).getQuoteAsset();
        // Always allow a trade INTO the quote asset
        if (quoteAsset == addresses[3]) { return true; }
        Accounting accounting = Accounting(Hub(Trading(msg.sender).hub()).accounting());
        return accounting.getFundHoldingsLength() <= maxPositions;
    }

    function position() external view returns (Applied) { return Applied.post; }
}
