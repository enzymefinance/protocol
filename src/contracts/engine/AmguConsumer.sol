pragma solidity ^0.4.21;

import "math.sol";
import "ERC20.i.sol";
import "PriceSource.i.sol";
import "Version.i.sol";
import "Engine.sol";

/// @notice inherit this pay AMGU
contract AmguConsumer is DSMath {

    modifier amguPayable() {
        uint initialGas = gasleft();
        _;
        uint mlnPerAmgu = Engine(engine()).getAmguPrice();
        uint ethPerMln;
        (ethPerMln,) = PriceSourceInterface(priceSource()).getPrice(mlnToken());
        uint ethToPay = mul(
            sub(initialGas, gasleft()),
            mul(mlnPerAmgu, ethPerMln)
        ) / 1 ether;
        require(msg.value >= ethToPay, "Insufficent amgu");
        Engine(engine()).payAmguInEther.value(ethToPay)();
        msg.sender.transfer(sub(msg.value, ethToPay));
    }

    function engine() view returns (address);
    function mlnToken() view returns (address);
    function priceSource() view returns (address);
}

