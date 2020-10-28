const { whales } = require('@melonproject/testutils/mainnet.json');

if (!process.env.MAINNET_ARCHIVE_NODE) {
  console.warn('=====================================================');
  console.warn('WARNING: Skipping end-to-end tests.');
  console.warn('');
  console.warn(
    'You must specify a mainnet archive node endpoint (MAINNET_ARCHIVE_NODE) to run the end-to-end tests.',
  );
  console.warn('=====================================================');
}

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

const e2e = {
  ...common,
  displayName: 'e2e',
  preset: '@crestproject/ganache',
  testMatch: ['**/?(*.)+(e2e).[jt]s?(x)'],
  testEnvironmentOptions: {
    ganacheProviderOptions: {
      gasLimit: 0x989680,
      default_balance_ether: 10000000000000,
      unlocked_accounts: Object.values(whales),
      fork_block_number: 11091788,
      fork: process.env.MAINNET_ARCHIVE_NODE,
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
  projects: process.env.MAINNET_ARCHIVE_NODE ? [unit, e2e] : [unit],
};
