const {nab, call, send} = require('../utils/deploy-contract');

const main = async input => {
  const oasisDex = await nab('OasisDexExchange', [ input.oasis.conf.closeTime ], input.oasis.addr);
  const quoteSym = input.oasis.conf.quoteToken;
  const quoteTokenAddress = input.tokens.addr[quoteSym];
  for (const [sym, baseTokenAddress] of Object.entries(input.tokens.addr)) {
    if (sym === quoteSym) {
      continue;
    }
    const alreadyWhitelisted = await call(oasisDex, 'isTokenPairWhitelisted', [ baseTokenAddress, quoteTokenAddress ]);
    if (!alreadyWhitelisted) {
      await send(oasisDex, 'addTokenPairWhitelist', [ baseTokenAddress, quoteTokenAddress ]);
    }
  }

  return { "OasisDexExchange": oasisDex };
}

module.exports = main;
