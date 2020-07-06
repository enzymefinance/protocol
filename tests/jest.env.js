const NodeEnvironment = require('jest-environment-node');
const ganache = require('ganache-core');
const ethers = require('ethers');
const Web3 = require('web3');

class MelonEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
  }

  async setup() {
    await super.setup();

    const provider = ganache.provider({
      fork: `http://127.0.0.1:${this.global.forkPort}`,
      network_id: 1,
      gasLimit: this.global.forkGasLimit,
      unlocked_accounts: this.global.forkUnlockedAccounts || [],
      accounts: this.global.forkAccounts || [],
    });

    this.global.web3 = new Web3(provider, null, {
      transactionConfirmationBlocks: 1
    });

    this.global.ethersProvider = new ethers.providers.Web3Provider(provider);
    this.global.ethersSigners = this.global.forkAccounts.map(account => {
      this.global.web3.eth.accounts.wallet.add(account.secretKey);

      const wallet = new ethers.Wallet(account.secretKey);
      return wallet.connect(this.global.ethersProvider);
    });
  }
}

module.exports = MelonEnvironment;