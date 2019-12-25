const fs = require('fs');
const deployEthfinex = require('./deploy-ethfinex');
const deployKyber = require('./deploy-kyber');
const deployMelon = require('./deploy-melon');
const deployOasis = require('./deploy-oasis');
const deployTokens = require('./deploy-tokens');
const deployUniswap = require('./deploy-uniswap');
const deployZeroExV2 = require('./deploy-zeroex-v2');

// strip addresses from contract objects in a deployment
const getAllAddrs = obj => {
  const allAddresses = {};
  Object.entries(obj).forEach(
    ([name, contract]) => allAddresses[name] = contract.options.address
  );
  return allAddresses;
}

// TODO: a more elegant way to do this?
// pass in names of contracts that should be force redeployed
const partialRedeploy = async (contractsToRedeploy=[]) => {
  const deployInput = JSON.parse(fs.readFileSync(process.env.CONF));
  Object.keys(deployInput).forEach(category => {
    if (!deployInput[category].addr) {
      return;
    }
    Object.keys(deployInput[category].addr).forEach(contractName => {
      if (contractsToRedeploy.indexOf(contractName) !== -1) {
        deployInput[category].addr[contractName] = "";
      }
    });
  });
  return deploySystem(deployInput);
}

const deploySystem = async input => {
  const deployOut = Object.assign({}, input);
  let contracts = {};
  if (input.tokens) {
    const tokens = await deployTokens(input);
    deployOut.tokens.addr = getAllAddrs(tokens);
    contracts = Object.assign(contracts, tokens);
  }
  if (input.oasis) {
    const oasis = await deployOasis(input);
    deployOut.oasis.addr = getAllAddrs(oasis);
    contracts = Object.assign(contracts, oasis);
  }
  if (input.zeroExV2) {
    const zeroExV2 = await deployZeroExV2(input);
    deployOut.zeroExV2.addr = getAllAddrs(zeroExV2);
    contracts = Object.assign(contracts, zeroExV2);
  }
  if (input.ethfinex) {
    const ethfinex = await deployEthfinex(input);
    deployOut.ethfinex.addr = getAllAddrs(ethfinex);
    contracts = Object.assign(contracts, ethfinex);
  }
  if (input.uniswap) {
    const uniswap = await deployUniswap(input);
    deployOut.uniswap.addr = getAllAddrs(uniswap);
    contracts = Object.assign(contracts, uniswap);
  }
  if (input.kyber) {
    const kyber = await deployKyber(input);
    deployOut.kyber.addr = getAllAddrs(kyber);
    contracts = Object.assign(contracts, kyber);
  }
  if (input.melon) {
    const melon = await deployMelon(input);
    deployOut.melon.addr = getAllAddrs(melon);
    contracts = Object.assign(contracts, melon);
  }
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

module.exports = {deploySystem, partialRedeploy};
