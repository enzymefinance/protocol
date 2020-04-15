const conf = require('../deploy-config.js');
const OasisDexExchange = artifacts.require('OasisDexExchange');

module.exports = async deployer => {
  await deployer.deploy(OasisDexExchange, conf.oasisDexCloseTime);
}
