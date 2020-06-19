const conf = require('../deploy-config.js');
const Engine = artifacts.require('Engine');
const Registry = artifacts.require('Registry');

module.exports = async deployer => {
  await deployer.deploy(
    Engine,
    conf.melonEngineDelay,
    (await Registry.deployed()).address
  );
}
