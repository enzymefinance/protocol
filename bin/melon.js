#!/usr/bin/env node
// require('babel-polyfill');
const R = require('ramda');
const path = require('path');
const fs = require('fs');
const program = require('commander');
const pkg = require('../package.json');
const { getPrice } = require('@melonproject/token-math/price');
const { createQuantity } = require('@melonproject/token-math/quantity');

program
  .version(pkg.version, '-v, --version')
  .description('The Melon Protocol CLI');

program
  .command('compile [<glob>]')
  .description('Compile the Melon Smart Contracts.')
  .action(async glob => {
    console.log(glob ? `Compiling ${glob}` : 'Compiling all contracts');

    try {
      const { compileGlob } = require('./compile');
      // await initTestEnvironment();
      await compileGlob(glob);
    } catch (e) {
      console.error(e);
    } finally {
      process.exit();
    }
  });

program
  .command('deploy')
  .description(
    'Deploy the Melon smart contracts. By default: A full deploy to the local chain at localhost:8545',
  )
  .action(async () => {
    console.log(`Deploying thirdparty & melon contracts (development setup).`);
    const {
      initTestEnvironment,
    } = require('../lib/tests/utils/initTestEnvironment');
    const {
      deployThirdparty,
    } = require('../lib/utils/deploy/deployThirdparty');
    const { deploySystem } = require('../lib/utils/deploy/deploySystem');

    const environment = await initTestEnvironment('https://localhost:8545');
    const thirdpartyContracts = await deployThirdparty(environment);
    const { deployment } = await deploySystem(environment, thirdpartyContracts);
    const chainId = await environment.eth.net.getId();

    const chainMap = {
      1: 'mainnet',
      42: 'kovan',
    };

    const chainName = chainMap[chainId] || 'development';

    fs.writeFileSync(
      `./deployments/${chainName}-${environment.track}.json`,
      JSON.stringify(deployment, null, 2),
    );

    process.exit();
  });

program
  .command('set-price <symbol> <value>')
  .description('Sets a price on the price feed.')
  .action(async (symbol, value) => {
    console.log(`Setting the price for ${symbol} to ${value}`);
    const {
      initTestEnvironment,
    } = require('../lib/tests/utils/initTestEnvironment');
    const { update } = require('../lib/contracts/prices/transactions/update');
    const {
      getQuoteToken,
    } = require('../lib/contracts/prices/calls/getQuoteToken');
    const { getDeployment } = require('../lib/utils/solidity/getDeployment');
    const environment = await initTestEnvironment();
    const { priceSource, tokens } = await getDeployment(environment);
    const quoteToken = await getQuoteToken(priceSource, environment);
    const baseToken = tokens.find(token => {
      return token.symbol === symbol.toUpperCase();
    });

    const newPrice = getPrice(
      createQuantity(baseToken, 1),
      createQuantity(quoteToken, value),
    );

    await update(priceSource, [newPrice]);

    console.log(`Successfully updated the price for ${symbol}.`);
    process.exit();
  });

program.on('command:*', function() {
  program.help();
  process.exit();
});

if (process.argv.length < 3) {
  program.help();
  process.exit();
}

program.parse(process.argv);
