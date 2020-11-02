require('@crestproject/hardhat/codegen');
require('hardhat-contract-sizer');

module.exports = {
  solidity: {
    version: '0.6.8',
  },
  paths: {
    artifacts: './.hardhat/artifacts',
    cache: './.hardhat/cache',
  },
  contractSizer: {
    disambiguatePaths: false,
  },
  codeGenerator: {
    enabled: true,
    clear: true,
    bytecode: {
      path: './packages/protocol/artifacts',
    },
    abi: {
      path: './packages/protocol/artifacts',
    },
    typescript: {
      path: './packages/protocol/src/codegen',
    },
  },
};
