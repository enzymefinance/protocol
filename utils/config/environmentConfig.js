module.exports = {
  live: {
    networkId: '1',
    host: 'localhost',
    port: 8545,
    gas: 6700000,
    gasPrice: 100000000000,
    protocol: {
      registrar: {
        assetsToRegister: [
          'OW-ETH', 'SAI', 'MKR', 'DGD', 'GNT',
          'REP', 'ICN'
        ],
      },
      datafeed: {
        interval: 60 * 60, // one hour
        validity: 60 * 60,
      },
    },
  },
  kovan: {
    networkId: '42',
    host: 'localhost',
    port: 8545,
    gas: 6690000,
    gasPrice: 100000000000,
    protocol: {
      registrar: {
        assetsToRegister: [
          'ANT-T', 'BNT-T', 'BAT-T', 'BTC-T', 'DGD-T', 'DOGE-T', 'ETC-T', 'ETH-T', 'EUR-T',
          'GNO-T', 'GNT-T', 'ICN-T', 'LTC-T', 'REP-T', 'XRP-T', 'SNGLS-T', 'SNT-T'
        ],
      },
      datafeed: {
        interval: 120,
        validity: 60,
      },
    },
  },
  development: {
    networkId: '*',
    host: 'localhost',
    port: 8545,
    gas: 6900000,
    gasPrice: 100000000000,
    protocol: {
      registrar: {
        assetsToRegister: [
          'ANT-T', 'BNT-T', 'BAT-T', 'BTC-T', 'DGD-T', 'DOGE-T', 'ETC-T', 'ETH-T', 'EUR-T',
          'GNO-T', 'GNT-T', 'ICN-T', 'LTC-T', 'REP-T', 'XRP-T', 'SNGLS-T', 'SNT-T'
        ],
      },
      datafeed: {
        interval: 0,
        validity: 60,
      },
      fund: {
        managementReward: 10,
        performanceReward: 0
      }
    },
  },
}
