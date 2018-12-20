pragma solidity ^0.4.21;

import "Hub.sol";
import "Policy.sol";
import "MatchingMarketAdapter.sol";
import "PriceSource.i.sol";
import "math.sol";

contract PriceTolerance is DSMath, Policy {
    uint tolerance;

    bytes4 constant public MAKE_ORDER = 0x79705be7; // makeOrderSignature
    bytes4 constant public TAKE_ORDER = 0xe51be6e8; // takeOrderSignature

    // _tolerance: 10 equals to 10% of tolerance
    function PriceTolerance(uint256 _tolerance) public {
        tolerance = _tolerance ** uint256(17);
    }

    function takeOasisDex(address ofExchange, bytes32 identifier, uint fillTakerQuantity) view returns (bool) {
        var (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = MatchingMarket(ofExchange).getOffer(uint(identifier));

        uint fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        PriceSourceInterface pricefeed = PriceSourceInterface(Hub(Trading(address(msg.sender)).hub()).priceSource());
        uint referencePrice;
        (referencePrice, ) = pricefeed.getReferencePriceInfo(takerAsset, makerAsset);

        uint orderPrice = pricefeed.getOrderPriceInfo(
            takerAsset,
            makerAsset,
            fillTakerQuantity,
            fillMakerQuantity
        );

        return orderPrice >= sub(referencePrice, wmul(tolerance, referencePrice));
    }

    function takeGenericOrder(address makerAsset, address takerAsset, uint[3] values) view returns (bool) {
        uint fillTakerQuantity = values[2];
        uint fillMakerQuantity = mul(fillTakerQuantity, values[0]) / values[1];

        PriceSourceInterface pricefeed = PriceSourceInterface(Hub(Trading(address(msg.sender)).hub()).priceSource());
        uint referencePrice;
        (referencePrice, ) = pricefeed.getReferencePriceInfo(takerAsset, makerAsset);

        uint orderPrice = pricefeed.getOrderPriceInfo(
            takerAsset,
            makerAsset,
            fillTakerQuantity,
            fillMakerQuantity
        );

        return orderPrice >= sub(referencePrice, wmul(tolerance, referencePrice));
    }

    function takeOrder(address[5] addresses, uint[3] values, bytes32 identifier) public view returns (bool) {
        if (identifier == 0x0) {
            return takeGenericOrder(addresses[2], addresses[3], values);
        } else {
            return takeOasisDex(addresses[4], identifier, values[2]);
        }
    }

    function makeOrder(address[5] addresses, uint[3] values, bytes32 identifier) public view returns (bool) {
        PriceSourceInterface pricefeed = PriceSourceInterface(Hub(Trading(address(msg.sender)).hub()).priceSource());

        uint ratio;
        (ratio,) = PriceSourceInterface(pricefeed).getReferencePriceInfo(addresses[2], addresses[3]);
        uint _value = PriceSourceInterface(pricefeed).getOrderPriceInfo(addresses[2], addresses[3], values[0], values[1]);

        int res = int(ratio) - int(_value);
        if (res < 0) {
            return true;
        } else {
            return wdiv(uint(res), ratio) <= tolerance;
        }
    }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        if (sig == MAKE_ORDER) {
            return makeOrder(addresses, values, identifier);
        } else if (sig == TAKE_ORDER) {
            return takeOrder(addresses, values, identifier);
        }
        revert("Signature was neither MakeOrder nor TakeOrder");
    }

    function position() external view returns (Applied) { return Applied.pre; }
}
