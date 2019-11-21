const {nab, call, send} = require('./deploy-contract');

const main = async input => {
  const matchingMarket = await nab('MatchingMarket', [ input.oasis.conf.closeTime ], input.oasis.addr);
  const quoteSym = input.oasis.conf.quoteToken;
  const quoteTokenAddress = input.tokens.addr[quoteSym];
  for (const [sym, baseTokenAddress] of Object.entries(input.tokens.addr)) {
    if (sym === quoteSym) {
      continue;
    }
    const alreadyWhitelisted = await call(matchingMarket, 'isTokenPairWhitelisted', [ baseTokenAddress, quoteTokenAddress ]);
    if (!alreadyWhitelisted) {
      await send(matchingMarket, 'addTokenPairWhitelist', [ baseTokenAddress, quoteTokenAddress ]);
    }
  }

  return { "MatchingMarket": matchingMarket.options.address };
}

module.exports = main;
