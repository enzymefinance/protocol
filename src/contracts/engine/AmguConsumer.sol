pragma solidity ^0.4.21;

import "math.sol";
import "ERC20.i.sol";
import "PriceSource.i.sol";
import "Version.i.sol";
import "Engine.sol";
import "Registry.sol";

/// @notice inherit this to pay AMGU on a function call
contract AmguConsumer is DSMath {

    /// @dev deductFromRefund is used when sending extra eth beyond amgu
    modifier amguPayable(uint deductFromRefund) {
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
        require(
            msg.value >= add(ethToPay, deductFromRefund),
            "Insufficent AMGU and/or incentive"
        );
        Engine(engine()).payAmguInEther.value(ethToPay)();
        msg.sender.transfer(
            sub(
                sub(msg.value, ethToPay),
                deductFromRefund
            )
        );
    }

    function engine() view returns (address);
    function mlnToken() view returns (address);
    function priceSource() view returns (address);
    function registry() view returns (address);
}

