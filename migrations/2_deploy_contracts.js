// const AragonToken = artifacts.require('./AragonToken.sol');
// const BAToken = artifacts.require('./BAToken.sol');
// const BancorToken = artifacts.require('./BancorToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const DigixGoldToken = artifacts.require('./DigixGoldToken.sol');
// const DogecoinToken = artifacts.require('./DogecoinToken.sol');
// const EtherClassicToken = artifacts.require('./EtherClassicToken.sol');
const EtherToken = artifacts.require('./EtherToken.sol');
const EuroToken = artifacts.require('./EuroToken.sol');
const GnosisToken = artifacts.require('./GnosisToken.sol');
const GolemToken = artifacts.require('./GolemToken.sol');
const IconomiToken = artifacts.require('./IconomiToken.sol');
// const LitecoinToken = artifacts.require('./LitecoinToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');
const RepToken = artifacts.require('./RepToken.sol');
// const StatusToken = artifacts.require('./StatusToken.sol');
const PriceFeed = artifacts.require('./PriceFeed.sol');
const Exchange = artifacts.require('./Exchange.sol');
const Universe = artifacts.require('./Universe.sol');

module.exports = (deployer, network, accounts) => {
  // Deploy contracts
  if (network === 'development') {
    deployer.deploy([
      // AragonToken,
      // BAToken,
      // BancorToken,
      BitcoinToken,
      DigixGoldToken,
      // DogecoinToken,
      // EtherClassicToken,
      EtherToken,
      EuroToken,
      GnosisToken,
      GolemToken,
      IconomiToken,
      // LitecoinToken,
      MelonToken,
      RepToken,
      // StatusToken,
      Exchange,
    ]).then(() =>
      deployer.deploy(PriceFeed, accounts[1], EtherToken.address)
    ).then(() =>
      deployer.deploy(Universe,
        [EtherToken.address, MelonToken.address, BitcoinToken.address, RepToken.address, EuroToken.address, DigixGoldToken.address, GnosisToken.address, GolemToken.address, IconomiToken.address],
        Array(9).fill(PriceFeed.address),
        Array(9).fill(Exchange.address)
      )
    );
  }

  if (network === 'kovan') {
    deployer.deploy([
      // AragonToken,
      // BAToken,
      // BancorToken,
      BitcoinToken,
      DigixGoldToken,
      // DogecoinToken,
      // EtherClassicToken,
      EtherToken,
      EuroToken,
      GnosisToken,
      GolemToken,
      IconomiToken,
      // LitecoinToken,
      MelonToken,
      RepToken,
      // StatusToken,
      Exchange,
      // Redeem,
    ]).then(() =>
      deployer.deploy(PriceFeed, accounts[0], EtherToken.address)
    ).then(() =>
      deployer.deploy(Universe,
        [EtherToken.address, MelonToken.address, BitcoinToken.address, RepToken.address, EuroToken.address, DigixGoldToken.address, GnosisToken.address, GolemToken.address, IconomiToken.address],
        Array(9).fill(PriceFeed.address),
        Array(9).fill(Exchange.address)
      )
    );
  }
};
