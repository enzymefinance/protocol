const conf = require('../deploy-config.js');
const { assetDataUtils } = require('@0x/order-utils-v2');
const ZeroExV2Exchange = artifacts.require('ZeroExV2Exchange');
const ZeroExV2ERC20Proxy = artifacts.require('ZeroExV2ERC20Proxy');
const ZRX = artifacts.require('ZRX');

const zeroAddress = '0x0000000000000000000000000000000000000000'; // TODO: import instead

module.exports = async deployer => {
  const exchange = await deployer.deploy(ZeroExV2Exchange);
  const erc20Proxy = await deployer.deploy(ZeroExV2ERC20Proxy);

  await erc20Proxy.addAuthorizedAddress(exchange.options.address);
  const proxyId = await erc20Proxy.getProxyId();
  const currentProxy = await exchange.assetProxies(proxyId);
  if (currentProxy === zeroAddress || proxyId === null) { // TODO: conditions still useful?
    await exchange.registerAssetProxy(erc20Proxy.options.address);
  }
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(ZRX.deployed().options.address);
  await exchange.changeZRXAssetData(zrxAssetData);
}
