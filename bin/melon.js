#!/usr/bin/env node
require('dotenv').config({
  path: require('find-up').sync(['.env', '.env.defaults']),
});
require('ts-node').register();
require('tsconfig-paths').register();

const fs = require('fs');
const { initTestEnvironment } = require('../src/utils/environment');
const { deploySystem } = require('../src/utils/deploySystem');
const debug = require('debug')('melon:protocol');

initTestEnvironment().then(async () => {
  debug(
    'Deploying Melon Protocol to: ',
    process.env.JSON_RPC_ENDPOINT,
    ' CWD',
    process.cwd(),
  );
  const addresses = await deploySystem();
  fs.writeFileSync('./addressBook.json', JSON.stringify(addresses, null, 2));
  debug("Wrote deployed addresses to: './addresses/dev.json'.");
  process.exit();
});
