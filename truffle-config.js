const path = require('path');

const coverageContractsDir = path.join(process.cwd(), '.coverage_contracts');
const regularContractsDir = path.join(process.cwd(), 'contracts');

module.exports = {
  compilers: {
    solc: {
      version: '0.6.8',
      docker: false,
      parser: 'solcjs',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: 'istanbul'
      }
    }
  },
  contracts_directory: process.env.COVERAGE ? coverageContractsDir : regularContractsDir,
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*" // Match any network id
    },
    coverage: {
      host: "127.0.0.1",
      port: 9545,
      network_id: 1,
      // gas: 0xffffffffff,
    }
  }
};
