export default {
  setupFilesAfterEnv: ['./jest.setup.ts'],
  testEnvironment: './jest.environment.ts',
  testTimeout: 240000,
  roots: ['./hardhat/tests'],
  moduleNameMapper: {
    '^@enzymefinance/ethers$': '<rootDir>/hardhat/ethers',
    '^@enzymefinance/testutils$': '<rootDir>/hardhat/testutils',
    '^@enzymefinance/protocol$': '<rootDir>/hardhat',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
};
