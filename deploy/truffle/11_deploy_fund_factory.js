const conf = require('../deploy-config.js');

const FeeManagerFactory = artifacts.require('FeeManagerFactory');
const FundFactory = artifacts.require('FundFactory');
const PolicyManagerFactory = artifacts.require('PolicyManagerFactory');
const Registry = artifacts.require('Registry');
const SharesFactory = artifacts.require('SharesFactory');
const VaultFactory = artifacts.require('VaultFactory');

module.exports = async deployer => {
  const registry = await Registry.deployed();
  const fundFactory = await deployer.deploy(
    FundFactory,
    (await FeeManagerFactory.deployed()).address,
    (await SharesFactory.deployed()).address,
    (await VaultFactory.deployed()).address,
    (await PolicyManagerFactory.deployed()).address,
    registry.address,
    conf.melonFundFactoryOwner
  );

  await registry.setFundFactory(fundFactory.address);
}
