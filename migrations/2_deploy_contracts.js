module.exports = (deployer) => {
  // Deploy contracts
  deployer.deploy([
    [EtherToken, { gas: 4000000, data: EtherToken.unlinked_binary }],
    [BitcoinToken, { gas: 4000000, data: BitcoinToken.unlinked_binary }],
    [DollarToken, { gass: 4000000, data: DollarToken.unlinked_binary }],
    [EuroToken, { gas: 4000000, data: EuroToken.unlinked_binary }],
    [PriceFeed, { gas: 4000000, data: PriceFeed.unlinked_binary }],
    [Exchange, { gas: 4000000, data: Exchange.unlinked_binary }],
  ]).then(() =>
    deployer.deploy(Registrar,
      [EtherToken.address, BitcoinToken.address, DollarToken.address, EuroToken.address],
      [PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address],
      [Exchange.address, Exchange.address, Exchange.address, Exchange.address],
      { gas: 4000000, data: Registrar.unlinked_binary }
    )
  );
};
