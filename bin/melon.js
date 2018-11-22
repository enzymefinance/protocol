#!/usr/bin/env node
require('babel-polyfill');
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

program.on('command:*', function() {
  program.help();
  process.exit();
});

if (process.argv.length < 3) {
  program.help();
  process.exit();
}

program.parse(process.argv);
