pragma solidity ^0.4.21;

import "math.sol";
import "ERC20.i.sol";
import "PriceSource.i.sol";
import "Version.i.sol";
import "Engine.sol";

/// @notice inherit this to pay AMGU on a function call
contract AmguConsumer is DSMath {

    /// @dev deductFromRefund is used when sending extra eth beyond amgu
    modifier amguPayable(uint deductFromRefund) {
        uint initialGas = gasleft();
        _;
        uint mlnPerAmgu = Engine(engine()).getAmguPrice();
        uint ethPerMln;
        (ethPerMln,) = PriceSourceInterface(priceSource()).getPrice(mlnToken());

        uint ethToPay = mul(
            sub(initialGas, gasleft()), // gas (and thus amgu) used
            mul(mlnPerAmgu, ethPerMln)  // eth per amgu
        ) / 10 ** 18;
        require(msg.value >= ethToPay, "Insufficent amgu");
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
}

