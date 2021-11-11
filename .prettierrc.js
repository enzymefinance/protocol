module.exports = {
  ...require('@enzymefinance/prettier-config'),
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
