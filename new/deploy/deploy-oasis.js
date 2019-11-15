const fs = require('fs');
const { nab, send } = require('./deploy-contract');

const deploy_in = './deploy_out.json'; // TODO: rename
const deploy_out = './deploy_out.json'; // TODO: rename

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

if (require.main === module) {
  const input = JSON.parse(fs.readFileSync(deploy_in, 'utf8'));
  main(input).then(addrs => {
    const output = Object.assign({}, input);
    output.oasis.addr = addrs;
    fs.writeFileSync(deploy_out, JSON.stringify(output, null, '  '));
    console.log(`Written to ${deploy_out}`);
    console.log(addrs);
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1) });
}

module.exports = main;
