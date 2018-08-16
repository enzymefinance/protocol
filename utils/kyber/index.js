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
    await setupReserve(configPath);
  });

program
  .command('updatePrices')
  .option('-c, --config <filename>', 'Config file', process.env.CONFIG)
  .action(async cmd => {
    const configPath = path.resolve(__dirname, cmd.config);
    await updateReservePrices(configPath);
    await updateReservePrices(configPath);
  });

program.parse(process.argv);
