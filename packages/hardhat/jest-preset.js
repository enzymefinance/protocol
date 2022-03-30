module.exports = {
  globalSetup: require.resolve('@enzymefinance/hardhat/jest/config/global-setup'),
  globalTeardown: require.resolve('@enzymefinance/hardhat/jest/config/global-teardown'),
  setupFilesAfterEnv: [require.resolve('@enzymefinance/hardhat/jest/config/setup')],
  testEnvironment: require.resolve('@enzymefinance/hardhat/jest/config/environment'),
  testTimeout: 240000,
};
