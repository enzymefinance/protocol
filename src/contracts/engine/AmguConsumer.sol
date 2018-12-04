pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../dependencies/token/ERC20.i.sol";
import "../prices/PriceSource.i.sol";
import "../version/Version.i.sol";
import "./Engine.sol";

// cleanup
// TODO: can function know it is payable?
// TODO: can modifier itself be payable?

// TODO: collect AMGU in other contracts
/// @notice inherit this pay AMGU
contract AmguConsumer is DSMath {

    modifier amguPayable() {
        uint initialGas = gasleft();
        _;
        uint mlnPerAmgu = VersionInterface(version()).getAmguPrice();
        uint ethPerMln;
        (ethPerMln,) = PriceSourceInterface(priceSource()).getPrice(mlnAddress());
        uint ethToPay = mul(
            sub(initialGas, gasleft()),
            mul(mlnPerAmgu, ethPerMln)
        ) / 1 ether;
        require(msg.value >= ethToPay, "Insufficent amgu");
        Engine(engine()).payAmguInEther.value(ethToPay)();
        msg.sender.transfer(sub(msg.value, ethToPay));
    }

    function engine() view returns (address);
    function mlnAddress() view returns (address);
    function priceSource() view returns (address);
    function version() view returns (address);
}

