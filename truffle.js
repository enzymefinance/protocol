module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      gas: 7100000,
      network_id: '*', // Match any network id
    },
    kovan: {
      host: 'localhost',
      port: 8545,
      gas: 7100000,
      network_id: 42,
    },
  },
  mocha: {
    slow: 500,
  },
};
