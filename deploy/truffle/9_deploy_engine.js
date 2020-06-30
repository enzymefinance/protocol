const Engine = artifacts.require('Engine');
const Registry = artifacts.require('Registry');

const melonEngineDelay = 2592000;

module.exports = async deployer => {
  const registry = await Registry.deployed();
  await deployer.deploy(Engine, melonEngineDelay, registry.address);
}
