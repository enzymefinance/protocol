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
    console.log(glob ? 'Compiling all contracts' : `Compiling ${glob}`);

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
  .description('Deploy the Melon smart contracts')
  .action(async (dir, cmd) => {
    const {
      initTestEnvironment,
    } = require('../lib/utils/environment/initTestEnvironment');
    const { deploySystem } = require('../lib/utils/deploySystem');
    const environment = await initTestEnvironment();
    const thisDeployment = await deploySystem();
    const deploymentsPath = path.join(
      __dirname,
      '..',
      'out',
      'deployments.json',
    );

    let otherDeployments = {};

    fs.access(deploymentsPath, fs.constants.F_OK | fs.constants.W_OK, err => {
      if (err) {
        console.error(
          `${deploymentsPath} ${
            err.code === 'ENOENT' ? 'does not exist' : 'is read-only'
          }`,
        );
      } else {
        const raw = fs.readFileSync(deploymentsPath, { encoding: 'utf8' });
        otherDeployments = JSON.parse(raw);
      }
    });

    const deploymentId = `${await environment.eth.net.getId()}:${
      environment.track
    }`;

    otherDeployments[deploymentId] = thisDeployment;

    fs.writeFileSync(
      deploymentsPath,
      JSON.stringify(otherDeployments, null, 2),
    );
    console.log(
      'Wrote deployed addresses as',
      deploymentId,
      'to',
      deploymentsPath,
    );
    console.log(
      "You can use it with: `import protocol from '@melonproject/protocol';",
    );
    console.log('// and then ...;');
    console.log(
      'const deployment = protocol.utils.solidity.getDeployment(environment);',
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
    } = require('../lib/utils/environment/initTestEnvironment');
    const { update } = require('../lib/contracts/prices/transactions/update');
    const { getQuoteToken } = require('../lib/contracts/prices/calls/getQuoteToken');
    const { getDeployment } = require('../lib/utils/solidity/getDeployment');
    const environment = await initTestEnvironment();
    const { priceSource, tokens } = await getDeployment(environment);
    const quoteToken = await getQuoteToken(priceSource, environment);
    const baseToken = tokens.find((token) => {
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
