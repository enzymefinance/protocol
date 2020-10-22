module.exports = {
  preset: '@crestproject/buidler',
  rootDir: 'tests',
  testTimeout: 60000,
  testEnvironmentOptions: {
    buidlerConfigs: [require.resolve('./buidler.config')],
  },
  globals: {
    'ts-jest': {
      diagnostics: {
        warnOnly: true,
      },
    },
  },
};
