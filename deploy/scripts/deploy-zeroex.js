const {nab, call, send} = require('../utils/deploy-contract');

const zeroAddress = '0x0000000000000000000000000000000000000000'; // TODO: import from util

const main = async input => {
  const exchange = await nab('Exchange', [], input.zeroex.addr);
  const erc20Proxy = await nab('ERC20Proxy', [], input.zeroex.addr);

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
  await send(exchange, 'changeZRXAssetData', [input.tokens.addr.ZRX]);

  return {
    "Exchange": exchange,
    "ERC20Proxy": erc20Proxy
  };
}

module.exports = main;
