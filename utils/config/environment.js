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
          'W-ETH', 'MLN', 'MKR', 'DAI'
        ],
      },
      pricefeed: {
        interval: 60 * 60, // one hour
        validity: 60 * 60,
      },
      governance: {
        authority: '0x00b5d2D3DB5CBAb9c2eb3ED3642A0c289008425B'
      }
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
          'ETH-T-M', 'MLN-T-M', 'MKR-T-M', 'DAI-T-M'
        ],
      },
      pricefeed: {
        interval: 60,
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
      pricefeed: {
        interval: 0,
        validity: 60,
      },
      fund: {
        managementFee: 10,
        performanceFee: 0
      }
    },
  },
}
