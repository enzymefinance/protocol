const fs = require('fs');
const Web3 = require('web3');
const deployIn = require('./get-deploy-input');

const web3 = new Web3(
  deployIn.conf.provider,
  null,
  { transactionConfirmationBlocks: 1 }
);
const keystore = fs.readFileSync(process.env.KEYSTORE, 'utf8'); // TODO: move away from env var
const password = fs.readFileSync(process.env.PASSFILE, 'utf8').trim();
const unlocked = web3.eth.accounts.decrypt(keystore, password);
web3.eth.accounts.wallet.add(unlocked.privateKey);

// get private keys stored in a file, like that produced by ganache --acctKeys
if (process.env.PRIVATE_KEYS) { // TODO: move away from env var
  const keys = JSON.parse(fs.readFileSync(process.env.PRIVATE_KEYS));
  for (const v of Object.values(keys)) { web3.eth.accounts.wallet.add(v); }
}

module.exports = web3;
