import program from 'commander';
import setupReserve from './setupReserve';
import updateReservePrices from './updateReservePrices';

const fs = require("fs");
const path = require('path');

program
  .command('setupReserve')
  .option('-c, --config <filename>', 'Config file', process.env.CONFIG)
  .action(async cmd => {
    const configPath = path.resolve(__dirname, cmd.config);
    const configJson = JSON.parse(fs.readFileSync(configPath));
    await setupReserve(configJson);
  });
/*
const fs = require("fs");

const devchainConfigFile = "./utils/kyber/devchain-reserve.json";
populateDevConfig();
const json = JSON.parse(fs.readFileSync(devchainConfigFile));
setupReserve(json).then(function(env) {
  updateReservePrices(deployed.ConversionRates);
});
*/
program.parse(process.argv);
