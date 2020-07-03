const NodeEnvironment = require('jest-environment-node');
const ganache = require('ganache-core');
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
      accounts: (this.global.forkPrivateKeys || []).map(privateKey => ({
        secretKey: privateKey,
        balance: this.global.forkStartingBalance,
      })),
    });

    this.global.web3 = new Web3(provider, null, {
      transactionConfirmationBlocks: 1
    });

    (this.global.forkPrivateKeys || []).map(privateKey => {
      this.global.web3.eth.accounts.wallet.add(privateKey);
    });
  }
}

module.exports = MelonEnvironment;