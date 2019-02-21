pragma solidity ^0.4.25;

import "Hub.sol";
import "Policy.sol";
import "MatchingMarketAdapter.sol";
import "PriceSource.i.sol";
import "TradingSignatures.sol";
import "math.sol";

contract PriceTolerance is TradingSignatures, DSMath, Policy {
    uint public tolerance;

    uint constant MULTIPLIER = 10 ** 16; // to give effect of a percentage
    uint constant DIVISOR = 10 ** 18;

    // _tolerance: 10 equals to 10% of tolerance
    constructor(uint _tolerancePercent) {
        require(_tolerancePercent <= 100, "Tolerance range is 0% - 100%");
        tolerance = mul(_tolerancePercent, MULTIPLIER);
    }

    /// @notice Taken from OpenZeppelin (https://git.io/fhQqo)
   function signedSafeSub(int256 a, int256 b) internal pure returns (int256) {
        int256 c = a - b;
        require((b >= 0 && c <= a) || (b < 0 && c > a));

        return c;
    }

    function takeOasisDex(
        address ofExchange,
        bytes32 identifier,
        uint fillTakerQuantity
    ) public view returns (bool) {
        uint maxMakerQuantity;
        address makerAsset;
        uint maxTakerQuantity;
        address takerAsset;
        (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = MatchingMarket(ofExchange).getOffer(uint(identifier));

        uint fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        PriceSourceInterface pricefeed = PriceSourceInterface(Hub(Trading(address(msg.sender)).hub()).priceSource());
        uint referencePrice;
        (referencePrice,) = pricefeed.getReferencePriceInfo(takerAsset, makerAsset);

        uint orderPrice = pricefeed.getOrderPriceInfo(
            takerAsset,
            makerAsset,
            fillTakerQuantity,
            fillMakerQuantity
        );

        return orderPrice >= sub(
            referencePrice,
            mul(tolerance, referencePrice) / DIVISOR
        );
    }

    function takeGenericOrder(
        address makerAsset,
        address takerAsset,
        uint[3] values
    ) public view returns (bool) {
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

        return orderPrice >= sub(
            referencePrice,
            mul(tolerance, referencePrice) / DIVISOR
        );
    }

    function takeOrder(
        address[5] addresses,
        uint[3] values,
        bytes32 identifier
    ) public view returns (bool) {
        if (identifier == 0x0) {
            return takeGenericOrder(addresses[2], addresses[3], values);
        } else {
            return takeOasisDex(addresses[4], identifier, values[2]);
        }
    }

    function makeOrder(
        address[5] addresses,
        uint[3] values,
        bytes32 identifier
    ) public view returns (bool) {
        PriceSourceInterface pricefeed = PriceSourceInterface(Hub(Trading(address(msg.sender)).hub()).priceSource());

        uint ratio;
        (ratio,) = PriceSourceInterface(pricefeed).getReferencePriceInfo(addresses[2], addresses[3]);
        uint _value = PriceSourceInterface(pricefeed).getOrderPriceInfo(addresses[2], addresses[3], values[0], values[1]);

        int res = signedSafeSub(int(ratio), int(_value));
        if (res < 0) {
            return true;
        } else {
            return wdiv(uint(res), ratio) <= tolerance;
        }
    }

    function rule(
        bytes4 sig,
        address[5] addresses,
        uint[3] values,
        bytes32 identifier
    ) external view returns (bool) {
        if (sig == MAKE_ORDER) {
            return makeOrder(addresses, values, identifier);
        } else if (sig == TAKE_ORDER) {
            return takeOrder(addresses, values, identifier);
        }
        revert("Signature was neither MakeOrder nor TakeOrder");
    }

    function position() external view returns (Applied) { return Applied.pre; }
    function identifier() external view returns (string) { return 'PriceTolerance'; }
}
