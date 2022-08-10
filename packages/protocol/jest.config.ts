export default {
  setupFilesAfterEnv: ['./jest.setup.ts'],
  testEnvironment: './jest.environment.ts',
  testTimeout: 240000,
  roots: ['tests', 'src', 'deploy'],
  moduleNameMapper: {
    '^@enzymefinance/ethers$': '<rootDir>/../ethers/src',
    '^@enzymefinance/testutils$': '<rootDir>/tests/utils',
    '^@enzymefinance/protocol$': '<rootDir>/src',
  },
  transform: {
    '^.+\\.(t|j)sx?$': 'jest-esbuild',
  },
};
