const { whales } = require('./mainnet.json');

if (!process.env.MAINNET_ARCHIVE_NODE) {
  console.warn('=====================================================');
  console.warn('WARNING: Skipping end-to-end tests.');
  console.warn('');
  console.warn(
    'You must specify a mainnet archive node endpoint (MAINNET_ARCHIVE_NODE) to run the end-to-end tests.',
  );
  console.warn('=====================================================');
}

const e2e = {
  displayName: 'e2e',
  globals: {
    'ts-jest': {
      diagnostics: {
        warnOnly: true,
      },
    },
  },
  preset: '@crestproject/ganache',
  rootDir: 'tests',
  testEnvironmentOptions: {
    ganacheProviderOptions: {
      gasLimit: 0x989680,
      default_balance_ether: 10000000000000,
      unlocked_accounts: Object.values(whales),
      fork_block_number: 11091788,
      fork: process.env.MAINNET_ARCHIVE_NODE,
    },
  },
  testMatch: ['**/?(*.)+(e2e).[jt]s?(x)'],
};

const unit = {
  displayName: 'unit',
  globals: {
    'ts-jest': {
      diagnostics: {
        warnOnly: true,
      },
    },
  },
  preset: '@crestproject/hardhat',
  rootDir: 'tests',
};

module.exports = {
  testTimeout: 120000,
  projects: process.env.MAINNET_ARCHIVE_NODE ? [unit, e2e] : [unit],
};
