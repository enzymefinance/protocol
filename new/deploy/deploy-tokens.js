const {nab} = require('./deploy-contract');

const main = async input => {
  const tokenAddrs = input.tokens.addr;
  const weth = await nab('WETH', [], tokenAddrs);
  const mln = await nab('BurnableToken', ['MLN', 18, 'Melon Token'], tokenAddrs, 'MLN');
  const bat = await nab('PreminedToken', ['BAT', 18, ''], tokenAddrs, 'BAT');
  const dai = await nab('PreminedToken', ['DAI', 18, ''], tokenAddrs, 'DAI');
  const dgx = await nab('PreminedToken', ['DGX', 18, ''], tokenAddrs, 'DGX');
  const eur = await nab('PreminedToken', ['EUR', 18, ''], tokenAddrs, 'EUR');
  const knc = await nab('PreminedToken', ['KNC', 18, ''], tokenAddrs, 'KNC');
  const mkr = await nab('PreminedToken', ['MKR', 18, ''], tokenAddrs, 'MKR');
  const rep = await nab('PreminedToken', ['REP', 18, ''], tokenAddrs, 'REP');
  const zrx = await nab('PreminedToken', ['ZRX', 18, ''], tokenAddrs, 'ZRX');

  return {
    "WETH": weth.options.address,
    "MLN": mln.options.address,
    "BAT": bat.options.address,
    "DAI": dai.options.address,
    "DGX": dgx.options.address,
    "EUR": eur.options.address,
    "KNC": knc.options.address,
    "MKR": mkr.options.address,
    "REP": rep.options.address,
    "ZRX": zrx.options.address,
  };
}

module.exports = main;
