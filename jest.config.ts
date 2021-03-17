function project(name: string, roots: string[]) {
  return {
    displayName: name,
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
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
  project('persistent', ['tests/persistent']),
  project('core', ['tests/release/core']),
  project('infrastructure', ['tests/release/infrastructure']),
  project('policy', ['tests/release/extensions/policy-manager']),
  project('integration', ['tests/release/extensions/integration-manager']),
  project('fee', ['tests/release/extensions/fee-manager']),
  project('peripheral', ['tests/release/peripheral']),
  project('e2e', ['tests/release/e2e']),
].filter((project) => !!project);

export default {
  projects,
  testTimeout: 240000,
};
