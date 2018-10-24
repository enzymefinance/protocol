#!/usr/bin/env node
const R = require('ramda');
const path = require('path');
const fs = require('fs');
const program = require('commander');
const pkg = require('../package.json');
const tsConfig = require('../tsconfig.json');

const project = path.join(__dirname, '..', 'tsconfig.json');

require('dotenv').config({
  path: require('find-up').sync(['.env', '.env.defaults']),
});
// require('ts-node').register({ project, skipIgnore: true });

const tsconfigPaths = require('tsconfig-paths');
tsconfigPaths.register({
  baseUrl: path.dirname(project),
  paths: R.map(
    value => value.map(p => p.replace('src/', 'build/')),
    tsConfig.compilerOptions.paths,
  ),
});

const { initTestEnvironment } = require('../build/utils/environment');

program
  .version(pkg.version, '-v, --version')
  .description('The Melon Protocol CLI');

program
  .command('compile')
  .description('Compile the Melon Smart Contracts.')
  .action(async () => {
    console.log('Compiling all contracts');
    try {
      const { compileAll } = require('./compile');
      await initTestEnvironment();
      await compileAll();
    } catch (e) {
      console.error(e);
    } finally {
      process.exit();
    }
  });

program
  .command('deploy')
  .description(
    `Deploy the Melon Smart Contracts to ${process.env.JSON_RPC_ENDPOINT}`,
  )
  .action(async (dir, cmd) => {
    const { deploySystem } = require('../build/utils/deploySystem');
    await initTestEnvironment();
    const addresses = await deploySystem();
    fs.writeFileSync('./addressBook.json', JSON.stringify(addresses, null, 2));
    console.log("Wrote deployed addresses to: './addressBook.json'.");
    console.log(
      "You can use it with: `import * as addressBook from '@melonproject/protocol/addressBook.json';",
    );
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
