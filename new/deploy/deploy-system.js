const deployEthfinex = require('./deploy-ethfinex');
const deployKyber = require('./deploy-kyber');
const deployMelon = require('./deploy-melon');
const deployOasis = require('./deploy-oasis');
const deployTokens = require('./deploy-tokens');
const deployZeroex = require('./deploy-zeroex');
const fs = require('fs');

const main = async input => {
  const output = Object.assign({}, input);
  output.tokens.addr = await deployTokens(output);
  output.oasis.addr = await deployOasis(output);
  output.zeroex.addr = await deployZeroex(output);
  output.ethfinex.addr = await deployEthfinex(output);
  output.kyber.addr = await deployKyber(output);
  output.melon.addr = await deployMelon(output);
  return output;
}

if (require.main === module) {
  const infile = process.argv[2];
  const outfile = process.argv[3];
  const input = JSON.parse(fs.readFileSync(infile, 'utf8'));
  main(input).then(output => {
    fs.writeFileSync(outfile, JSON.stringify(output, null, '  '));
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1) });
}

module.exports = main;
