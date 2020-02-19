pragma solidity 0.6.1;

import "../../../dependencies/DSMath.sol";
import "../../../prices/IPriceSource.sol";
import "../../accounting/Accounting.sol";
import "../../trading/Trading.sol";
import "../TradingSignatures.sol";
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
        Accounting accounting = Accounting(Hub(Trading(msg.sender).hub()).accounting());
        address denominationAsset = accounting.DENOMINATION_ASSET();
        // Max concentration is only checked for non-quote assets
        address takerToken = (sig == TAKE_ORDER) ? addresses[2] : addresses[3];
        if (denominationAsset == takerToken) { return true; }

        uint concentration;
        uint totalGav = accounting.calcGav();
        if (sig == MAKE_ORDER) {
            IPriceSource priceSource = IPriceSource(Hub(Trading(msg.sender).hub()).priceSource());
            address makerToken = addresses[2];
            uint makerQuantiyBeingTraded = values[0];
            uint takerQuantityBeingTraded = values[1];

            uint takerTokenGavBeingTraded = priceSource.convertQuantity(
                takerQuantityBeingTraded, takerToken, denominationAsset
            );

            uint makerTokenGavBeingTraded;
            if (makerToken == denominationAsset) {
                makerTokenGavBeingTraded = makerQuantiyBeingTraded;
            }
            else {
                makerTokenGavBeingTraded = priceSource.convertQuantity(
                    makerQuantiyBeingTraded, makerToken, denominationAsset
                );
            }
            concentration = _calcConcentration(
                add(accounting.calcAssetGAV(takerToken), takerTokenGavBeingTraded),
                add(takerTokenGavBeingTraded, sub(totalGav, makerTokenGavBeingTraded))
            );
        }
        else {
            concentration = _calcConcentration(
                accounting.calcAssetGAV(takerToken),
                totalGav
            );
        }
        return concentration <= maxConcentration;
    }

    function position() external pure returns (Applied) { return Applied.post; }
    function identifier() external pure returns (string memory) { return 'MaxConcentration'; }

    function _calcConcentration(uint assetGav, uint totalGav) internal returns (uint) {
        return mul(assetGav, ONE_HUNDRED_PERCENT) / totalGav;
    }
}
