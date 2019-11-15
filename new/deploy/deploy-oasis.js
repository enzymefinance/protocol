const {nab, send} = require('./deploy-contract');

const main = async input => {
  const matchingMarket = await nab('MatchingMarket', [ input.oasis.conf.closeTime ], input.oasis.addr);
  const quoteSym = input.oasis.conf.quoteToken;
  const quoteTokenAddress = input.tokens.addr[quoteSym];
  for (const [sym, baseTokenAddress] of Object.entries(input.tokens.addr)) {
    if (sym !== quoteSym) {
      await send(matchingMarket, 'addTokenPairWhitelist', [ baseTokenAddress, quoteTokenAddress ]);
    }
  }

  return { "MatchingMarket": matchingMarket.options.address };
}

module.exports = main;
