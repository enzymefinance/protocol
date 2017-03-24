const EtherToken = artifacts.require('./EtherToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const RepToken = artifacts.require('./RepToken.sol');
const EuroToken = artifacts.require('./EuroToken.sol');
const PriceFeed = artifacts.require('./PriceFeed.sol');
const Exchange = artifacts.require('./Exchange.sol');
const Universe = artifacts.require('./Universe.sol');

module.exports = (deployer, network, accounts) => {
  // Deploy contracts
  deployer.deploy([
    [EtherToken, { gas: 4000000, data: EtherToken.unlinked_binary }],
    [MelonToken, { gas: 4000000, data: MelonToken.unlinked_binary }],
    [BitcoinToken, { gas: 4000000, data: BitcoinToken.unlinked_binary }],
    [RepToken, { gas: 4000000, data: RepToken.unlinked_binary }],
    [EuroToken, { gas: 4000000, data: EuroToken.unlinked_binary }],
    [Exchange, { gas: 4000000, data: Exchange.unlinked_binary }],
  ]).then(() =>
    deployer.deploy(PriceFeed, accounts[1], EtherToken.address)
  ).then(() =>
    deployer.deploy(Universe,
      [EtherToken.address, MelonToken.address, BitcoinToken.address, RepToken.address, EuroToken.address],
      [PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address],
      [Exchange.address, Exchange.address, Exchange.address, Exchange.address, Exchange.address],
      { gas: 4000000, data: Universe.unlinked_binary }
    )
  );
};
