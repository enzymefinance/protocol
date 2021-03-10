import 'dotenv/config';

function project(name: string, roots: string[]) {
  return {
    displayName: name,
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

const projects = [
  project('core', ['tests/release/core', 'tests/persistent', 'tests/mocks']),
  project('infrastructure', ['tests/release/infrastructure']),
  project('policy', ['tests/release/extensions/policy-manager']),
  project('integration', ['tests/release/extensions/integration-manager']),
  project('fee', ['tests/release/extensions/fee-manager']),
  project('peripheral', ['tests/release/peripheral']),
  project('e2e', ['tests/release/e2e']),
].filter((project) => !!project);

module.exports = {
  projects,
  testTimeout: 240000,
};
