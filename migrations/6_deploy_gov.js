const Calculate = artifacts.require('./calculate.sol');
const Accounting = artifacts.require('./accounting.sol');
const Governance = artifacts.require('./Governance.sol');
const Logger = artifacts.require('./Logger.sol');
const Version = artifacts.require('./Version.sol');
const Asset = artifacts.require('./Asset.sol');
const tokenInfo = require('./config/token_info.js');

module.exports = (deployer, network) => {
  let mlnTokenAddress;
  if (network !== 'development') {
    mlnTokenAddress = tokenInfo[network].find(t => t.symbol === 'MLN-T').address;
  } else {
    mlnTokenAddress = Asset.address;  // TODO: fix this (see footnote #1)
    deployer.deploy(Governance)
    .then(() => deployer.deploy(Logger))
    .then(() => deployer.deploy(Calculate))
    .then(() => deployer.deploy(Accounting))
    .then(() => deployer.link(Calculate, Version))
    .then(() => deployer.link(Accounting, Version))
    .then(() => deployer.deploy(Version, mlnTokenAddress, Logger.address))
    .catch(e => { throw e; });
  }
};

// #1: very fragile. This assumes that the last deployed asset is MLN, which
//    is only ensured by convention. See also: trufflesuite/truffle/issues/517
