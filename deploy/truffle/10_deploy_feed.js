const KyberNetworkProxy = artifacts.require('KyberNetworkProxy');
const KyberPriceFeed = artifacts.require('KyberPriceFeed');
const Registry = artifacts.require('Registry');

const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

module.exports = async deployer => {
  priceSource = await deployer.deploy(
    KyberPriceFeed,
    (await Registry.deployed()).address,
    mainnetAddrs.kyber.KyberNetworkProxy,
    conf.melonMaxSpread,
    mainnetAddrs.tokens.WETH,
    conf.melonMaxPriceDeviation
  );
}
