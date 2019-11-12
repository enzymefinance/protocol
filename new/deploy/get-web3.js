const fs = require('fs');
const Web3 = require('web3');
const deployIn = require('./get-deploy-input');

const web3 = new Web3(
  deployIn.conf.provider,
  null,
  { transactionConfirmationBlocks: 1 }
);
const keystore = fs.readFileSync(process.env.KEYSTORE, 'utf8');
const password = fs.readFileSync(process.env.PASSFILE, 'utf8').trim();
const unlocked = web3.eth.accounts.decrypt(keystore, password);
web3.eth.accounts.wallet.add(unlocked.privateKey);

module.exports = web3;
