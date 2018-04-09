module.exports = {
  live: {
    networkId: '1',
    host: 'localhost',
    port: 8549,
    gas: 6700000,
    gasPrice: 100000000000,
    protocol: {
      deployer: '0xc11149e320c31179195fe2c25105b98a9d4e045e',
      pricefeed: {
        interval: 60 * 60, // one hour
        validity: 60 * 60,
        operator: '0x145a3bb5f5fe0b9eb1ad38bd384c0ec06cc14b54',
        assetsToRegister: [
          'W-ETH', 'MKR', 'DAI'
        ],
      },
      governance: {
        authority: '0x00b5d2D3DB5CBAb9c2eb3ED3642A0c289008425B'
      },
    },
  },
  kovan: {
    networkId: '42',
    host: 'localhost',
    port: 8547,
    gas: 6690000,
    gasPrice: 100000000000,
    protocol: {
      pricefeed: {
        interval: 60,
        validity: 60,
        assetsToRegister: [
          'ETH-T-M', 'MKR-T-M', 'DAI-T-M'
        ],
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
        managementFee: 10 ** 16,
        performanceFee: 10
      },
      staking: {
        minimumAmount: 1000000,
        numOperators: 4
      }
    },
  },
}
