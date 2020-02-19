const {nab, call, send} = require('../utils/deploy-contract');

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

const main = async input => {
  const uniswapExchangeTemplate = await nab('UniswapExchange', [], input.uniswap.addr);
  const uniswapFactory = await nab('UniswapFactory', [], input.uniswap.addr);

  const isInitialized = (await call(uniswapFactory, 'exchangeTemplate')) !== EMPTY_ADDRESS;
  if (!isInitialized) {
    await send(uniswapFactory, 'initializeFactory', [uniswapExchangeTemplate.options.address]);

    for (const [sym, tokenAddress] of Object.entries(input.tokens.addr)) {
      await send(uniswapFactory, 'createExchange', [tokenAddress]);
    }
  }

  return {
    "UniswapExchange": uniswapExchangeTemplate,
    "UniswapFactory": uniswapFactory
  };
}

module.exports = main;
