const config = require('./tests/ganache/config');

module.exports = {
  skipFiles: [
    'dependencies/',
  ],
  providerOptions: {
    // allowUnlimitedContractSize: true,
    logger: console,
    fork: process.env.MAINNET_NODE_URL,
    port: 9545,
    network_id: 1,
    // gasLimit: 0xffffffffff,
    unlocked_accounts: config.forkUnlockedAccounts || [],
    accounts: (config.forkPrivateKeys || []).map(privateKey => ({
      secretKey: privateKey,
      balance: config.forkStartingBalance,
    })),
  }
};
