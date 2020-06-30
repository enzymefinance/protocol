module.exports = {
  roots: ['<rootDir>/tests'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|ts)$': 'ts-jest'
  },
  testRegex: '((\\.|/)(test))\\.(js|ts)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node', 'bin'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  moduleNameMapper: {
    '~/config': '<rootDir>/config',
    '~/(.*)': '<rootDir>/tests/$1'
  },
  globals: {
    'ts-jest': {
      tsConfig: '<rootDir>/tsconfig.json'
    }
  }
};
