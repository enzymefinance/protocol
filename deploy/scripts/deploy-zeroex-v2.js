const {nab, call, send} = require('../utils/deploy-contract');
const { assetDataUtils } = require('@0x/order-utils-v2');

const zeroAddress = '0x0000000000000000000000000000000000000000'; // TODO: import from util

const main = async input => {
  const exchange = await nab('ZeroExV2Exchange', [], input.zeroExV2.addr);
  const erc20Proxy = await nab('ZeroExV2ERC20Proxy', [], input.zeroExV2.addr);

  const alreadyAuth = await call(erc20Proxy, 'authorized', [exchange.options.address]);
  if (!alreadyAuth) {
    await send(erc20Proxy, 'addAuthorizedAddress', [exchange.options.address]);
  }
  const proxyId = await call(erc20Proxy, 'getProxyId');
  let currentProxy;
  if (proxyId !== null) {
    currentProxy = await call(exchange, 'assetProxies', [proxyId]);
  }
  if (currentProxy === zeroAddress || proxyId === null) {
    await send(exchange, 'registerAssetProxy', [erc20Proxy.options.address]);
  }
  // TODO: is this necessary to send each time?
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(input.tokens.addr.ZRX);

  await send(exchange, 'changeZRXAssetData', [zrxAssetData]);

  return {
    "ZeroExV2Exchange": exchange,
    "ZeroExV2ERC20Proxy": erc20Proxy
  };
}

module.exports = main;
