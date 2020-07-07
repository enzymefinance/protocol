const NodeEnvironment = require('jest-environment-node');
const ganache = require('ganache-core');
const Web3 = require('web3');
const config = require('./ganache/config');

class MelonEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();

    const provider = ganache.provider({
      fork: `http://127.0.0.1:${config.forkPort}`,
      gasLimit: '0x989680',
      accounts: config.forkAccounts,
      unlocked_accounts: config.forkUnlockedAccounts,
    });

    this.global.web3 = new Web3(provider);
    config.forkAccounts.forEach((account) => {
      this.global.web3.eth.accounts.wallet.add(account.secretKey);
    });
  }
}

module.exports = MelonEnvironment;
