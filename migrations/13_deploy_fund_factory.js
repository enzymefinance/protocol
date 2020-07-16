const FeeManagerFactory = artifacts.require('FeeManagerFactory');
const FundFactory = artifacts.require('FundFactory');
const PolicyManagerFactory = artifacts.require('PolicyManagerFactory');
const Registry = artifacts.require('Registry');
const SharesFactory = artifacts.require('SharesFactory');
const VaultFactory = artifacts.require('VaultFactory');

module.exports = async deployer => {
  const registry = await Registry.deployed();
  const feeManagerFactory = await FeeManagerFactory.deployed();
  const sharesFactory = await SharesFactory.deployed();
  const vaultFactory = await VaultFactory.deployed();
  const policyManagerFactory = await PolicyManagerFactory.deployed();

  const block = await web3.eth.getBlock("latest");

  const fundFactory = await deployer.deploy(
    FundFactory,
    feeManagerFactory.address,
    sharesFactory.address,
    vaultFactory.address,
    policyManagerFactory.address,
    registry.address,
    {gas: block.gasLimit}
  );

  await registry.setFundFactory(fundFactory.address);
}
