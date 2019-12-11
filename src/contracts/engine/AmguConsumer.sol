pragma solidity ^0.5.13;

import "../dependencies/math.sol";
import "../dependencies/token/ERC20.i.sol";
import "../prices/PriceSource.i.sol";
import "../version/Version.i.sol";
import "./Engine.sol";
import "../version/Registry.sol";

/// @notice inherit this to pay AMGU on a function call
contract AmguConsumer is DSMath {

    /// bool deductIncentive is used when sending extra eth beyond amgu
    modifier amguPayable(bool deductIncentive) {
        uint initialGas = gasleft();
        _;
        uint mlnPerAmgu = Engine(engine()).getAmguPrice();
        uint mlnQuantity = mul(
            mlnPerAmgu,
            sub(initialGas, gasleft())
        );
        address nativeAsset = Registry(registry()).nativeAsset();
        uint ethToPay = PriceSourceInterface(priceSource()).convertQuantity(
            mlnQuantity,
            mlnToken(),
            nativeAsset
        );
        uint incentiveAmount;
        if (deductIncentive) {
            incentiveAmount = Registry(registry()).incentive();
        } else {
            incentiveAmount = 0;
        }
        require(
            msg.value >= add(ethToPay, incentiveAmount),
            "Insufficent AMGU and/or incentive"
        );
        Engine(engine()).payAmguInEther.value(ethToPay)();

        require(
            msg.sender.send(
                sub(
                    sub(msg.value, ethToPay),
                    incentiveAmount
                )
            ),
            "Refund failed"
        );
    }

    function engine() view returns (address);
    function mlnToken() view returns (address);
    function priceSource() view returns (address);
    function registry() view returns (address);
}

