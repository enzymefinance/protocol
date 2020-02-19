module.exports = {
  roots: ['<rootDir>/tests'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  testRegex: '((\\.|/)(test))\\.(js)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node', 'bin'],
  setupFilesAfterEnv: ['./jest.setup.js'],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1'
  }
};
