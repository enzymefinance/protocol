module.exports = {
  preset: '@crestproject/buidler',
  rootDir: 'tests',
  testTimeout: 60000,
  testEnvironmentOptions: {
    buidlerConfigs: [
      require.resolve('./buidler.config'),
      require.resolve('@melonproject/utils/buidler.config'),
    ],
  },
  globals: {
    'ts-jest': {
      diagnostics: {
        warnOnly: true,
      },
    },
  },
};
