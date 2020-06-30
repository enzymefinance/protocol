const SharesRequestor = artifacts.require('SharesRequestor');
const Registry = artifacts.require('Registry');
const ValueInterpreter = artifacts.require('ValueInterpreter');

module.exports = async deployer => {
  const registry = await Registry.deployed();
  await deployer.deploy(SharesRequestor, registry.address);
  await deployer.deploy(ValueInterpreter, registry.address);
}
