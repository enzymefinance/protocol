const FeeManagerFactory = artifacts.require('FeeManagerFactory');
const PolicyManagerFactory = artifacts.require('PolicyManagerFactory');
const SharesFactory = artifacts.require('SharesFactory');
const VaultFactory = artifacts.require('VaultFactory');

module.exports = async deployer => {
  await deployer.deploy(FeeManagerFactory);
  await deployer.deploy(PolicyManagerFactory);
  await deployer.deploy(SharesFactory);
  await deployer.deploy(VaultFactory);
}
