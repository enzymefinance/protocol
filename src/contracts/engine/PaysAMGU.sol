// cleanup
// TODO: can function know it is payable?
// TODO: can modifier itself be payable?

// TODO: collect AMGU in other contracts
// TODO: get AMGU price from Version for example
/// @notice inherit this pay AMGU
contract PaysAMGU is DSMath {

    address priceSource;
    address version;
    address engine;

    constructor(
        address _priceSource,
        address _version,
        address _engine
    ) {
        priceSource = _priceSource;
        version = _version;
        engine = _engine;
    }

    modifier amgu_payable() {
        uint initialGas = gasLeft();
        _;
        // TODO: use actual contract type
        PriceSource source = PriceSource(priceSource);
        uint mlnPerAmgu = version.getAmguPrice();
        uint ethPerMln = source.getPrice(mln);
        uint ethPerAmgu = mul(mlnPerAmgu, ethPerMln);
        uint amguToPay = sub(initialGas, gasLeft());
        uint ethToPay = mul(amguToPay, ethPerAmgu);
        require(msg.value >= ethToPay);
        // TODO: send ether with this
        engine.payAmguInEther(ethToPay);
        // TODO: check this does not throw when sending 0
        msg.sender.transfer(msg.value - ethToPay);
    }
}

