pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../dependencies/token/ERC20.i.sol";
import "../prices/PriceSource.sol";
import "../version/Version.i.sol";
import "./Engine.sol";

// cleanup
// TODO: can function know it is payable?
// TODO: can modifier itself be payable?

// TODO: collect AMGU in other contracts
/// @notice inherit this pay AMGU
contract PaysAMGU is DSMath {

    address public priceSource;
    address public version;
    address public engine;
    address public mlnAddress;

    constructor(
        address _priceSource,
        address _version,
        address _engine,
        address _mlnAddress
    ) {
        priceSource = _priceSource;
        version = _version;
        engine = _engine;
        mlnAddress = _mlnAddress;
    }

    modifier amgu_payable() {
        uint initialGas = gasleft();
        _;
        PriceSource source = PriceSource(priceSource);
        uint mlnPerAmgu = VersionInterface(version).getAmguPrice();
        uint ethPerMln = source.getPrice(mlnAddress);
        uint ethPerAmgu = mul(mlnPerAmgu, ethPerMln);
        uint amguToPay = sub(initialGas, gasleft());
        uint ethToPay = mul(amguToPay, ethPerAmgu);
        require(msg.value >= ethToPay);
        Engine(engine).payAmguInEther.value(ethToPay)();
        msg.sender.transfer(msg.value - ethToPay);
    }
}

