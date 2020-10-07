module.exports = {
  preset: '@crestproject/buidler',
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
