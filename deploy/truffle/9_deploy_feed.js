const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

const KyberNetworkProxy = artifacts.require('KyberNetworkProxy');
const KyberPriceFeed = artifacts.require('KyberPriceFeed');
const Registry = artifacts.require('Registry');
const WETH = artifacts.require('WETH');

module.exports = async deployer => {
  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const kyberNetworkProxy = await KyberNetworkProxy.at(mainnetAddrs.kyber.KyberNetworkProxy);
  priceSource = await deployer.deploy(
    KyberPriceFeed,
    (await Registry.deployed()).address,
    kyberNetworkProxy.address,
    conf.melonMaxSpread,
    weth.address,
    conf.melonMaxPriceDeviation
  );
}
