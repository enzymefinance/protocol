const Rewards = artifacts.require('./rewards.sol');
const SimpleAdapter = artifacts.require('./simpleAdapter.sol');
const Governance = artifacts.require('./Governance.sol');
const Version = artifacts.require('./Version.sol');
const Fund = artifacts.require('./Fund.sol');
const Asset = artifacts.require('./Asset.sol');
const tokenInfo = require('./config/token_info.js');

module.exports = (deployer, network) => {
  let mlnTokenAddress;
  if (network !== 'development') {
    mlnTokenAddress = tokenInfo[network].find(t => t.symbol === 'MLN-T').address;
    deployer.deploy(Governance)
    .then(() => deployer.deploy(Rewards))
    .then(() => deployer.link(Rewards, Version))
    .then(() => deployer.link(Rewards, Fund))
    .then(() => deployer.deploy(SimpleAdapter))
    .then(() => deployer.link(SimpleAdapter, Version))
    .then(() => deployer.link(SimpleAdapter, Fund))
    .then(() => deployer.deploy(Version, '', '', mlnTokenAddress))
    .catch((e) => { throw e; });
  } else {
    mlnTokenAddress = Asset.address;  // TODO: fix this (see footnote #1)
    deployer.deploy(Governance)
    .then(() => deployer.deploy(Rewards))
    .then(() => deployer.link(Rewards, Version))
    .then(() => deployer.link(Rewards, Fund))
    .then(() => deployer.deploy(SimpleAdapter))
    .then(() => deployer.link(SimpleAdapter, Version))
    .then(() => deployer.link(SimpleAdapter, Fund))
    .then(() => deployer.deploy(Version, '', '', mlnTokenAddress))
    .catch((e) => { throw e; });
  }
};

// #1: very fragile. This assumes that the last deployed asset is MLN, which
//    is only ensured by convention. See also: trufflesuite/truffle/issues/517
