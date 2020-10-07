module.exports = {
  preset: '@crestproject/buidler',
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
