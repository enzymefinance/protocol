const {nab, send} = require('./deploy-contract');

const main = async input => {
  const exchange = await nab('Exchange', [], input.zeroex.addr);
  const erc20Proxy = await nab('ERC20Proxy', [], input.zeroex.addr);

  await send(erc20Proxy, 'addAuthorizedAddress', [exchange.options.address]);
  await send(exchange, 'registerAssetProxy', [erc20Proxy.options.address]);
  await send(exchange, 'changeZRXAssetData', [input.tokens.addr.ZRX]);

  return {
    "Exchange": exchange.options.address,
    "ERC20Proxy": erc20Proxy.options.address
  };
}

module.exports = main;
