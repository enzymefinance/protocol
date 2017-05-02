module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*" // Match any network id
    },
    ropsten: {
      host: "localhost",
      port: 8546,
      network_id: 3
    },
    kovan: {
      host: 'localhost',
      port: 8547,
      gas: 4900000,
      network_id: 42,
      from: '0x00E0B33cDb3AF8B55CD8467d6d13BC0Ba8035acF'
    }
  }
};
