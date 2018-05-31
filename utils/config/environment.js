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
          'MLN', 'WETH', 'MKR', 'DAI', 'ANT', 'ZRX', 'BAT',
          'DGD', 'GNO', 'OMG', 'JNT', 'REP', 'REQ', 'KNC'
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
    gas: 7000000,
    gasPrice: 100000000000,
    protocol: {
      pricefeed: {
        interval: 60,
        validity: 60,
        preEpochUpdatePeriod: 30,
        minimumUpdates: 1,
        assetsToRegister: [
          'MLN-T', 'WETH-T', 'MKR-T', 'DAI-T', 'ANT-T', 'ZRX-T', 'BAT-T',
          'DGD-T', 'GNO-T', 'OMG-T', 'JNT-T', 'REP-T', 'REQ-T', 'KNC-T'
        ],
      },
      staking: {
        minimumAmount: 1000000000,
        numOperators: 5,
        unstakeDelay: 60 * 60 * 24 * 7 // one week
      }
    },
  },
  competitionReplica: {
    networkId: '42',
    host: 'localhost',
    port: 8547,
    gas: 7000000,
    gasPrice: 100000000000,
    protocol: {
      pricefeed: {
        interval: 60,
        validity: 60,
        preEpochUpdatePeriod: 30,
        minimumUpdates: 1,
        assetsToRegister: [
          'MLN-T', 'WETH-T', 'MKR-T', 'DAI-T', 'ANT-T', 'ZRX-T', 'BAT-T',
          'DGD-T', 'GNO-T', 'OMG-T', 'JNT-T', 'REP-T', 'REQ-T', 'KNC-T'
        ],
      },
      staking: {
        minimumAmount: 1000000000,
        numOperators: 5,
        unstakeDelay: 60 * 60 * 24 * 7 // one week
      }
    },
  },
  development: {
    networkId: '*',
    host: 'localhost',
    port: 8545,
    gas: 8000000,
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
        preEpochUpdatePeriod: 60,
        minimumUpdates: 1
      },
      fund: {
        managementFee: 0,
        performanceFee: 0
      },
      staking: {
        minimumAmount: 1000000,
        numOperators: 4,
        unstakeDelay: 0
      }
    },
  },
}
