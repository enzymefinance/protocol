module.exports = {
  build: {
    'index.html': 'index.html',
    'app.js': [
      'javascripts/app.js',
    ],
    'app.css': [
      'stylesheets/app.css',
    ],
    'images/': 'images/',
  },
  rpc: {
    host: 'localhost',
    port: 8545,
  },
  networks: {
    live: {
      network_id: 1, // Ethereum public network
      // optional config values
      // host - defaults to 'localhost'
      // port - defaults to 8545
      // gas
      // gasPrice
      // from - default address to use for any transaction Truffle makes during migrations
    },
    ropsten: {
      network_id: 3, // Official Ethereum test network
      port: 8546,
    },
    development: {
      network_id: 'default',
    },
  },
};
