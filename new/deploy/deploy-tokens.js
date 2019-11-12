const fs = require('fs');
const web3 = require('./get-web3');
const nab = require('./deploy-contract').nab;
const deploy = require('./deploy-contract').deploy;
const deployIn = require('./get-deploy-input');

const deploy_in = './token_addrs.json'; // TODO: rename
const deploy_out = './tokens_out.json'; // TODO: rename

const main = async () => {
  const input = JSON.parse(fs.readFileSync(deploy_in, 'utf8'));
  const weth = await nab('WETH', [], input);
  const mln = await nab('BurnableToken', ['MLN', 18, 'Melon Token'], input, 'MLN');
  const bat = await nab('PreminedToken', ['BAT', 18, ''], input, 'BAT');
  const dai = await nab('PreminedToken', ['DAI', 18, ''], input, 'DAI');
  const dgx = await nab('PreminedToken', ['DGX', 18, ''], input, 'DGX');
  const eur = await nab('PreminedToken', ['EUR', 18, ''], input, 'EUR');
  const knc = await nab('PreminedToken', ['KNC', 18, ''], input, 'KNC');
  const mkr = await nab('PreminedToken', ['MKR', 18, ''], input, 'MKR');
  const rep = await nab('PreminedToken', ['REP', 18, ''], input, 'REP');
  const zrx = await nab('PreminedToken', ['ZRX', 18, ''], input, 'ZRX');

  const addrs = {
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
  fs.writeFileSync(deploy_out, JSON.stringify(addrs, null, '  '));
  console.log(`Written to ${deploy_out}`);
  console.log(addrs);
}

main().then(process.exit).catch(console.error);
