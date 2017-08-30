module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      gas: 7113095,
      network_id: '*', // Match any network id
    },
    kovan: {
      host: 'localhost',
      port: 8545,
      gas: 6197422,
      network_id: 42,
    },
    staging: { // Deployment of Kovan auxillary parts such as Assets, DataFeeds, Exchanges
      host: 'localhost',
      port: 8545,
      gas: 6197422,
      network_id: 42,
    },
  },
  mocha: {
    slow: 500,
  },
};
