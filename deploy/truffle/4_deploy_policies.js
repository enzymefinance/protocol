const conf = require('../deploy-config.js');
const PriceTolerance = artifacts.require('PriceTolerance');
const UserWhitelist = artifacts.require('UserWhitelist');

module.exports = async deployer => {
  await deployer.deploy(PriceTolerance, conf.melonPriceTolerance);
  await deployer.deploy(UserWhitelist, conf.melonUserWhitelist);
}
