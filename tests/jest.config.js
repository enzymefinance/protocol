const config = require('./ganache/config');

module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/tests'],
  testEnvironment: '<rootDir>/tests/jest.env.js',
  testEnvironmentOptions: {
    forkPort: config.forkPort,
    forkGasLimit: config.forkGasLimit,
    forkStartingBalance: config.forkStartingBalance,
    forkUnlockedAccounts: config.forkUnlockedAccounts,
    forkPrivateKeys: config.forkPrivateKeys,
  },
  transform: {
    '^.+\\.(js|ts)$': 'ts-jest'
  },
  testRegex: '((\\.|/)(test))\\.(js|ts)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node', 'bin'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  moduleNameMapper: {
    '~/config': '<rootDir>/config',
    '~/(.*)': '<rootDir>/tests/$1'
  },
  globals: {
    'ts-jest': {
      tsConfig: '<rootDir>/tsconfig.json',
      diagnostics: false
    }
  }
};
