const { whales } = require('@melonproject/testutils/mainnet.json');

const common = {
  roots: ['<rootDir>/tests'],
  globals: {
    'ts-jest': {
      babelConfig: true,
      diagnostics: {
        warnOnly: true,
      },
    },
  },
};

const fork = process.env.MAINNET_ARCHIVE_NODE || 'http://localhost:8545';
const e2e = {
  ...common,
  displayName: 'e2e',
  preset: '@crestproject/ganache',
  testMatch: ['**/?(*.)+(e2e).[jt]s?(x)'],
  testEnvironmentOptions: {
    ganacheProviderOptions: {
      gasLimit: 0x989680,
      mnemonic: 'test test test test test test test test test test test junk',
      default_balance_ether: 10000000000000,
      unlocked_accounts: Object.values(whales),
      fork_block_number: 11091788,
      fork,
    },
  },
};

const unit = {
  ...common,
  displayName: 'unit',
  preset: '@crestproject/hardhat',
};

module.exports = {
  testTimeout: 240000,
  projects: [unit, e2e],
};
