import program from 'commander';
import setupReserve from './setupReserve';
import updateReservePrices from './updateReservePrices';

const Web3 = require("web3");
const path = require('path');
const fs = require("fs");

const web3 = new Web3();

program
  .option('-w, --wallet <json file>', 'Wallet file', process.env.WALLET)
  .option('-p, --password <password file>', 'Wallet Password file', process.env.WALLET_PASSWORD
  );

program
  .command('setupReserve')
  .option('-c, --config <filename>', 'Config file', process.env.CONFIG)
  .action(async cmd => {
    const configPath = path.resolve(__dirname, cmd.config);
    const keystoreJson =  JSON.parse(fs.readFileSync(path.resolve(__dirname, program.wallet)));
    const password = fs.readFileSync(path.resolve(__dirname, program.password), 'utf8').trim();
    const account = await web3.eth.accounts.decrypt(keystoreJson, password);
    await setupReserve(configPath, account);
  });

program
  .command('updatePrices')
  .option('-c, --config <filename>', 'Config file', process.env.CONFIG)
  .action(async cmd => {
    const configPath = path.resolve(__dirname, cmd.config);
    const keystoreJson =  JSON.parse(fs.readFileSync(path.resolve(__dirname, program.wallet)));
    const password = fs.readFileSync(path.resolve(__dirname, program.password), 'utf8').trim();
    const account = await web3.eth.accounts.decrypt(keystoreJson, password);
    await updateReservePrices(configPath, account);
    await updateReservePrices(configPath, account);
  });

program.parse(process.argv);

// Check mandatory flags
if (!program.wallet || !program.password)
  program.help();
