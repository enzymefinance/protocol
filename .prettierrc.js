module.exports = {
  ...require('@enzymefinance/prettier-config'),
  plugins: [require.resolve('prettier-plugin-solidity')],
  overrides: [
    {
      files: '*.sol',
      options: {
        printWidth: 99,
        tabWidth: 4,
        useTabs: false,
        singleQuote: false,
        bracketSpacing: false,
        explicitTypes: 'always',
      },
    },
  ],
};
