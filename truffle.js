module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      gas: 4712388,
      network_id: '*', // Match any network id
    },
    kovan: {
      host: 'localhost',
      port: 8545,
      gas: 6000000,
      network_id: 42,
    },
    staging: { // Deployment of Kovan auxillary parts such as Assets, PriceFeeds, Exchanges
      host: 'localhost',
      port: 8545,
      gas: 6000000,
      network_id: 42,
    },
  },
  mocha: {
    slow: 500,
  },
};
