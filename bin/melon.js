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
  .command('deploy <endpoint>')
  .description('Deploy the Melon smart contracts')
  .action(async (endpoint) => {
    console.error('Deployment is currently not implemented. Tests now run on the in-memory devchain.');

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
