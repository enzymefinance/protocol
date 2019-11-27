const fs = require('fs');
const deployEthfinex = require('./deploy-ethfinex');
const deployKyber = require('./deploy-kyber');
const deployMelon = require('./deploy-melon');
const deployOasis = require('./deploy-oasis');
const deployTokens = require('./deploy-tokens');
const deployZeroex = require('./deploy-zeroex');

// strip addresses from contract objects in a deployment
const getAllAddrs = obj => {
  const allAddresses = {};
  Object.entries(obj).forEach(
    ([name, contract]) => allAddresses[name] = contract.options.address
  );
  return allAddresses;
}

const deploySystem = async input => {
  const deployOut = Object.assign({}, input);
  const tokens = await deployTokens(input);
  deployOut.tokens.addr = getAllAddrs(tokens);
  const oasis = await deployOasis(input);
  deployOut.oasis.addr = getAllAddrs(oasis);
  const zeroex = await deployZeroex(input);
  deployOut.zeroex.addr = getAllAddrs(zeroex);
  const ethfinex = await deployEthfinex(input);
  deployOut.ethfinex.addr = getAllAddrs(ethfinex);
  const kyber = await deployKyber(input);
  deployOut.kyber.addr = getAllAddrs(kyber);
  const melon = await deployMelon(input);
  deployOut.melon.addr = getAllAddrs(melon);
  const contracts = {
    ...tokens,
    ...oasis,
    ...zeroex,
    ...ethfinex,
    ...kyber,
    ...melon
  };
  return {contracts, deployOut};
}

if (require.main === module) {
  if (process.argv.length != 4) {
    console.error('Usage: deploy-system.js <deploy_in> <deploy_out>');
    process.exit(1);
  }
  const infile = process.argv[2];
  const outfile = process.argv[3];
  const input = JSON.parse(fs.readFileSync(infile, 'utf8'));
  deploySystem(input).then(result => {
    fs.writeFileSync(outfile, JSON.stringify(result.deployOut, null, '  '));
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1) });
}

module.exports = deploySystem;
