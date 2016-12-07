module.exports = function(deployer) {
  // Deploy contracts
  deployer.deploy([
    EtherToken,
    BitcoinToken,
    DollarToken,
    EuroToken,
    PriceFeed,
    Exchange
  ]).then(() => {
    return deployer.deploy(Registrar,
      [EtherToken.address, BitcoinToken.address, DollarToken.address, EuroToken.address],
      [PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address],
      [Exchange.address, Exchange.address, Exchange.address, Exchange.address]
    );
  });
};
