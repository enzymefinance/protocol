module.exports = {
  compilers: {
    solc: {
      version: '0.6.4',
      docker: true,
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
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*" // Match any network id
    }
  },
  contracts_directory: './src',
  contracts_build_directory: './out',
  migrations_directory: './deploy/truffle'
};