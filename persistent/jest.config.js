module.exports = {
  preset: '@crestproject/hardhat',
  rootDir: 'tests',
  testTimeout: 60000,
  globals: {
    'ts-jest': {
      diagnostics: {
        warnOnly: true,
      },
    },
  },
};
