const utils = require('web3-utils');
const KyberPriceFeed = artifacts.require('KyberPriceFeed');
const Registry = artifacts.require('Registry');
const mainnetAddrs = require('../config');

const maxSpread = utils.toWei('0.1', 'ether');
const maxPriceDeviation = utils.toWei('0.1', 'ether');

module.exports = async deployer => {
  const registry = await Registry.deployed();

  await deployer.deploy(
    KyberPriceFeed,
    registry.address,
    mainnetAddrs.kyber.KyberNetworkProxy,
    maxSpread,
    mainnetAddrs.tokens.WETH,
    maxPriceDeviation
  );
}
