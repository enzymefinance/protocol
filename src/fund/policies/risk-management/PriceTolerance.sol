pragma solidity 0.6.1;

import "../../hub/Hub.sol";
import "../../../prices/IPriceSource.sol";
import "../TradingSignatures.sol";
import "../../../dependencies/DSMath.sol";
import "../../trading/Trading.sol";
import "../../../exchanges/interfaces/IOasisDex.sol";

contract PriceTolerance is TradingSignatures, DSMath {
    enum Applied { pre, post }

    uint256 public tolerance;

    uint256 constant MULTIPLIER = 10 ** 16; // to give effect of a percentage
    uint256 constant DIVISOR = 10 ** 18;

    // _tolerance: 10 equals to 10% of tolerance
    constructor(uint256 _tolerancePercent) public {
        require(_tolerancePercent <= 100, "Tolerance range is 0% - 100%");
        tolerance = mul(_tolerancePercent, MULTIPLIER);
    }

    /// @notice Taken from OpenZeppelin (https://git.io/fhQqo)
   function signedSafeSub(int256 _a, int256 _b) internal pure returns (int256) {
        int256 c = _a - _b;
        require((_b >= 0 && c <= _a) || (_b < 0 && c > _a));

        return c;
    }

    function checkPriceToleranceTakeOrder(
        address _makerAsset,
        address _takerAsset,
        uint256 _fillMakerQuantity,
        uint256 _fillTakerQuantity
    )
        internal
        view
        returns (bool)
    {
        IPriceSource pricefeed = IPriceSource(Hub(Trading(msg.sender).hub()).priceSource());
        uint256 referencePrice;
        (referencePrice,) = pricefeed.getReferencePriceInfo(_takerAsset, _makerAsset);

        uint256 orderPrice = pricefeed.getOrderPriceInfo(
            _takerAsset,
            _fillTakerQuantity,
            _fillMakerQuantity
        );

        return orderPrice >= sub(
            referencePrice,
            mul(tolerance, referencePrice) / DIVISOR
        );
    }

    function takeGenericOrder(
        address _makerAsset,
        address _takerAsset,
        uint256[3] memory _values
    ) public view returns (bool) {
        uint256 fillTakerQuantity = _values[2];
        uint256 fillMakerQuantity = mul(fillTakerQuantity, _values[0]) / _values[1];
        return checkPriceToleranceTakeOrder(
            _makerAsset, _takerAsset, fillMakerQuantity, fillTakerQuantity
        );
    }

    function takeOasisDex(
        address _exchange,
        bytes32 _identifier,
        uint256 _fillTakerQuantity
    ) public view returns (bool) {
        uint256 maxMakerQuantity;
        address makerAsset;
        uint256 maxTakerQuantity;
        address takerAsset;
        (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = IOasisDex(_exchange).getOffer(uint256(_identifier));

        uint256 fillMakerQuantity = mul(_fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;
        return checkPriceToleranceTakeOrder(
            makerAsset, takerAsset, fillMakerQuantity, _fillTakerQuantity
        );
    }

    function takeOrder(
        address[5] memory _addresses,
        uint256[3] memory _values,
        bytes32 _identifier
    ) public view returns (bool) {
        if (_identifier == 0x0) {
            return takeGenericOrder(_addresses[2], _addresses[3], _values);
        } else {
            return takeOasisDex(_addresses[4], _identifier, _values[2]);
        }
    }

    function makeOrder(
        address[5] memory _addresses,
        uint256[3] memory _values,
        bytes32 _identifier
    ) public view returns (bool) {
        IPriceSource pricefeed = IPriceSource(Hub(Trading(msg.sender).hub()).priceSource());

        uint256 ratio;
        (ratio,) = IPriceSource(pricefeed).getReferencePriceInfo(_addresses[2], _addresses[3]);
        uint256 value = IPriceSource(pricefeed).getOrderPriceInfo(_addresses[2], _values[0], _values[1]);

        int res = signedSafeSub(int(ratio), int(value));
        if (res < 0) {
            return true;
        } else {
            return wdiv(uint256(res), ratio) <= tolerance;
        }
    }

    function rule(
        bytes4 _sig,
        address[5] calldata _addresses,
        uint256[3] calldata _values,
        bytes32 _identifier
    ) external returns (bool) {
        if (_sig == MAKE_ORDER) {
            return makeOrder(_addresses, _values, _identifier);
        } else if (_sig == TAKE_ORDER) {
            return takeOrder(_addresses, _values, _identifier);
        }
        revert("Signature was neither MakeOrder nor TakeOrder");
    }

    function position() external pure returns (Applied) { return Applied.pre; }
    function identifier() external pure returns (string memory) { return 'PriceTolerance'; }
}
