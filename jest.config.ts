import 'dotenv/config';
import { utils } from 'ethers';

const mnemonic = 'test test test test test test test test test test test junk';

function common(name: string, roots: string[]) {
  return {
    displayName: name,
    roots,
    globals: {
      'ts-jest': {
        babelConfig: true,
        diagnostics: false,
      },
    },
  };
}

function fork(name: string, roots: string[]) {
  return {
    ...common(name, roots),
    preset: '@crestproject/jest',
    testEnvironmentOptions: {
      hardhatNetworkOptions: {
        // loggingEnabled: true,
        gas: 9500000,
        accounts: {
          mnemonic,
          count: 5,
          accountsBalance: utils.parseUnits('1', 36).toString(),
        },
        ...(process.env.COVERAGE && {
          allowUnlimitedContractSize: true,
        }),
      },
      hardhatTestOptions: {
        ...(process.env.COVERAGE && {
          coverage: true,
        }),
      },
    },
  };
}

function unit(name: string, roots: string[]) {
  return {
    ...common(name, roots),
    preset: '@crestproject/hardhat',
    testEnvironmentOptions: {
      hardhatNetworkOptions: {
        // loggingEnabled: true,
        gas: 9500000,
        accounts: {
          mnemonic,
          count: 10,
          accountsBalance: utils.parseUnits('1', 36).toString(),
        },
        forking: {
          enabled: false,
        },
        ...(process.env.COVERAGE && {
          allowUnlimitedContractSize: true,
        }),
      },
      hardhatTestOptions: {
        ...(process.env.COVERAGE && {
          coverage: true,
        }),
      },
    },
  };
}

const projects = [
  unit('core', ['tests/release/core', 'tests/persistent', 'tests/mocks']),
  unit('infrastructure', ['tests/release/infrastructure']),
  unit('policy', ['tests/release/extensions/policy-manager']),
  unit('integration', ['tests/release/extensions/integration-manager']),
  unit('fee', ['tests/release/extensions/fee-manager']),
  unit('peripheral', ['tests/release/peripheral']),
  fork('e2e', ['tests/release/e2e']),
].filter((project) => !!project);

module.exports = {
  testTimeout: 240000,
  projects,
};
