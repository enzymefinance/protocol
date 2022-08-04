module.exports = {
  setupFilesAfterEnv: [require.resolve('@enzymefinance/hardhat/jest/config/setup')],
  testEnvironment: require.resolve('@enzymefinance/hardhat/jest/config/environment'),
  testTimeout: 240000,
};
