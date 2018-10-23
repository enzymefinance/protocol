#!/usr/bin/env node
require('dotenv').config({
  path: require('find-up').sync(['.env', '.env.defaults']),
});
require('ts-node').register();
require('tsconfig-paths').register();

const fs = require('fs');
const program = require('commander');

const pkg = require('../package.json');
const { initTestEnvironment } = require('../src/utils/environment');
const { compileAll } = require('../src/utils/solidity/compile');
const { deploySystem } = require('../src/utils/deploySystem');

program
  .version(pkg.version, '-v, --version')
  .description('The Melon Protocol CLI');

program
  .command('compile')
  .description('Compile the Melon Smart Contracts.')
  .action(async () => {
    await initTestEnvironment();
    await compileAll();
    process.exit();
  });

program
  .command('deploy')
  .description(
    `Deploy the Melon Smart Contracts to ${process.env.JSON_RPC_ENDPOINT}`,
  )
  .action(async (dir, cmd) => {
    await initTestEnvironment();
    const addresses = await deploySystem();
    fs.writeFileSync('./addressBook.json', JSON.stringify(addresses, null, 2));
    console.log("Wrote deployed addresses to: './addresses/dev.json'.");
    process.exit();
  });

program.command('').action(program.help());

program.parse(process.argv);
