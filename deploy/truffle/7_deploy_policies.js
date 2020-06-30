const AssetBlacklist = artifacts.require('AssetBlacklist');
const AssetWhitelist = artifacts.require('AssetWhitelist');
const MaxConcentration = artifacts.require('MaxConcentration');
const MaxPositions = artifacts.require('MaxPositions');
const PriceTolerance = artifacts.require('PriceTolerance');
const Registry = artifacts.require('Registry');
const UserWhitelist = artifacts.require('UserWhitelist');

module.exports = async deployer => {
  const registry = await Registry.deployed();
  await deployer.deploy(AssetBlacklist, registry.address);
  await deployer.deploy(AssetWhitelist, registry.address);
  await deployer.deploy(MaxConcentration, registry.address);
  await deployer.deploy(MaxPositions, registry.address);
  await deployer.deploy(PriceTolerance, registry.address);
  await deployer.deploy(UserWhitelist, registry.address);
}
