module.exports = {
  compilers: {
    solc: {
      version: '0.6.8',
      docker: true,
      parser: 'solcjs',
      settings: {
        evmVersion: 'istanbul',
        optimizer: {
          enabled: true,
          runs: 1
        }
      }
    }
  },
  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*' // Match any network id
    }
  }
};
