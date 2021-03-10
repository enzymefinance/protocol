import 'dotenv/config';

function common(name: string, roots: string[]) {
  return {
    displayName: name,
    globals: {
      'ts-jest': {
        babelConfig: true,
        diagnostics: false,
      },
    },
    preset: '@enzymefinance/hardhat',
    roots,
  };
}

function fork(name: string, roots: string[]) {
  return {
    ...common(name, roots),
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    testEnvironmentOptions: {
      hardhatNetworkOptions: {
        accounts: {
          count: 5,
        },
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
    testEnvironmentOptions: {
      hardhatNetworkOptions: {
        forking: {
          enabled: false,
        },
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
  projects,
  testTimeout: 240000,
};
