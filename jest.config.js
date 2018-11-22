module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '((\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'bin'],
  setupTestFrameworkScriptFile: './tests/setup.js',
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/src/$1',
  },
};
