const {nab, call, send} = require('./deploy-contract');

const zeroAddress = '0x0000000000000000000000000000000000000000'; // TODO: import from util

const main = async input => {
  const exchange = await nab('Exchange', [], input.zeroex.addr);
  const erc20Proxy = await nab('ERC20Proxy', [], input.zeroex.addr);

  const alreadyAuth = await call(erc20Proxy, 'authorized', [exchange.options.address]);
  if (!alreadyAuth) {
    await send(erc20Proxy, 'addAuthorizedAddress', [exchange.options.address]);
  }
  const proxyId = await call(erc20Proxy, 'getProxyId');
  const currentProxy = await call(exchange, 'assetProxies', [proxyId]);
  console.log(currentProxy);
  if (currentProxy === zeroAddress) {
    await send(exchange, 'registerAssetProxy', [erc20Proxy.options.address]);
  }
  await send(exchange, 'changeZRXAssetData', [input.tokens.addr.ZRX]);

  return {
    "Exchange": exchange.options.address,
    "ERC20Proxy": erc20Proxy.options.address
  };
}

module.exports = main;
