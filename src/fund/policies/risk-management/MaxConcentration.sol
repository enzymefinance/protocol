pragma solidity 0.6.4;

import "../TradingSignatures.sol";
import "../../accounting/IAccounting.sol";
import "../../hub/ISpoke.sol";
import "../../../dependencies/DSMath.sol";
import "../../../prices/IPriceSource.sol";

contract MaxConcentration is TradingSignatures, DSMath {
    enum Applied { pre, post }

    uint internal constant ONE_HUNDRED_PERCENT = 10 ** 18;  // 100%
    uint public maxConcentration;

    constructor(uint _maxConcentration) public {
        require(
            _maxConcentration <= ONE_HUNDRED_PERCENT,
            "Max concentration cannot exceed 100%"
        );
        maxConcentration = _maxConcentration;
    }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier)
        external
        returns (bool)
    {
        if (sig != TAKE_ORDER) revert("Signature was not TakeOrder");
        IAccounting accounting = IAccounting(IHub(ISpoke(msg.sender).hub()).accounting());
        address denominationAsset = accounting.DENOMINATION_ASSET();
        // Max concentration is only checked for non-quote assets
        address takerToken = addresses[2];
        if (denominationAsset == takerToken) { return true; }

        uint totalGav = accounting.calcGav();
        uint concentration = _calcConcentration(
            accounting.calcAssetGav(takerToken),
            totalGav
        );
        return concentration <= maxConcentration;
    }

    function position() external pure returns (Applied) { return Applied.post; }
    function identifier() external pure returns (string memory) { return 'MaxConcentration'; }

    function _calcConcentration(uint assetGav, uint totalGav) internal returns (uint) {
        return mul(assetGav, ONE_HUNDRED_PERCENT) / totalGav;
    }
}
