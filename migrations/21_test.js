// const FeeManagerFactory = artifacts.require('FeeManagerFactory');
const FundFactory = artifacts.require('FundFactory');
// const PolicyManagerFactory = artifacts.require('PolicyManagerFactory');
// const SharesFactory = artifacts.require('SharesFactory');
// const Registry = artifacts.require('Registry');
const VaultFactory = artifacts.require('VaultFactory');
const Migrations = artifacts.require('Migrations');

module.exports = async deployer => {
  const block = await web3.eth.getBlock("latest");
  await deployer.deploy(Migrations);
  await deployer.deploy(VaultFactory, {gas: block.gasLimit});

  // const registry = await Registry.deployed();
  // const feeManagerFactory = await FeeManagerFactory.deployed();
  // const sharesFactory = await SharesFactory.deployed();
  const vaultFactory = await VaultFactory.deployed();
  // const policyManagerFactory = await PolicyManagerFactory.deployed();


  const fundFactory = await deployer.deploy(
    FundFactory,
    "0x61935cbdd02287b511119ddb11aeb42f1593b7ef",
    "0x61935cbdd02287b511119ddb11aeb42f1593b7ef",
    vaultFactory.address,
    "0x61935cbdd02287b511119ddb11aeb42f1593b7ef",
    "0x61935cbdd02287b511119ddb11aeb42f1593b7ef",
    // {gas: block.gasLimit}
  );

  // await registry.setFundFactory(fundFactory.address);
}
