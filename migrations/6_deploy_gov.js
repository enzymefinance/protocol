const Calculate = artifacts.require('./calculate.sol');
const Governance = artifacts.require('./Governance.sol');
const Logger = artifacts.require('./Logger.sol');
const Version = artifacts.require('./Version.sol');
const Asset = artifacts.require('./Asset.sol');
const tokenInfo = require('./config/token_info.js');

module.exports = (deployer, network) => {
  let mlnTokenAddress;
  let logger;
  if (network !== 'development') {
    mlnTokenAddress = tokenInfo[network].find(t => t.symbol === 'MLN-T').address;
  } else {
    deployer.deploy(Asset, 'MelonToken', 'MLN', 18)
    .then(() => mlnTokenAddress = Asset.address)
    .then(() => deployer.deploy(Governance))
    .then(() => deployer.deploy(Logger))
    .then(() => deployer.deploy(Calculate))
    .then(() => deployer.link(Calculate, Version))
    .then(() => console.log(mlnTokenAddress))
    .then(() => deployer.deploy(Version, mlnTokenAddress, Logger.address));
  }
};
