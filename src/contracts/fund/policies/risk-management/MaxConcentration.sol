pragma solidity ^0.4.25;

import "math.sol";
import "PriceSource.i.sol";
import "Accounting.sol";
import "Trading.sol";
import "TradingSignatures.sol";
import "Policy.sol";

contract MaxConcentration is TradingSignatures, DSMath, Policy {
    uint internal constant ONE_HUNDRED_PERCENT = 10 ** 18;  // 100%
    uint public maxConcentration;

    constructor(uint _maxConcentration) {
        require(
            _maxConcentration <= ONE_HUNDRED_PERCENT,
            "Max concentration cannot exceed 100%"
        );
        maxConcentration = _maxConcentration;
    }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier)
        external
        view
        returns (bool)
    {
        Accounting accounting = Accounting(Hub(Trading(msg.sender).hub()).accounting());
        address denominationAsset = accounting.DENOMINATION_ASSET();
        // Max concentration is only checked for non-quote assets
        address incomingToken = (sig == TAKE_ORDER) ? addresses[2] : addresses[3];
        if (denominationAsset == incomingToken) { return true; }
        uint concentration = mul(
            accounting.calcAssetGAV(incomingToken),
            ONE_HUNDRED_PERCENT
        ) / accounting.calcGav();
        return concentration <= maxConcentration;
    }

    function position() external view returns (Applied) { return Applied.post; }
    function identifier() external view returns (string) { return 'MaxConcentration'; }
}
