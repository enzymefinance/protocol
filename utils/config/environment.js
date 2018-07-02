module.exports = {
  live: {
    networkId: '1',
    host: 'localhost',
    port: 8549,
    gas: 6900000,
    gasPrice: 35000000000,
    protocol: {
      deployer: '0x0d580ae50B58fe08514dEAB4e38c0DFdB0D30adC',
      pricefeed: {
        updater: '0xD041e27AC805ed204Ba227Ff9a3E159940DDF0e4',
        interval: 60 * 60 * 24, // one day
        validity: 60 * 60 * 24,
        preEpochUpdatePeriod: 60 * 60 * 6,
        minimumUpdates: 1,
        assetsToRegister: [
          'MLN', 'WETH', 'MKR', 'DAI', 'ANT', 'ZRX',
          'BAT', 'DGD', 'GNO', 'OMG', 'JNT', 'REP', 'REQ', 'KNC'
        ],
      },
      staking: {
        minimumAmount: 50000000000000000000,  // 5 MLN
        numOperators: 5,
        unstakeDelay: 60 * 60 * 24 * 7 // one week
      },
      governance: {
        authorities: ['0x2c7cf699e9e2bf78020ad8a6b4faa28ee6722b7b'],
        quorum: 1,
        window: 60 * 60 * 24 * 365
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
          'MLN-T', 'WETH-T', 'MKR-T', 'DAI-T', 'ANT-T', 'ZRX-T',
          'BAT-T','DGD-T', 'GNO-T', 'OMG-T', 'JNT-T', 'REP-T', 'REQ-T', 'KNC-T'
        ],
      },
      staking: {
        minimumAmount: 1000000000,
        numOperators: 5,
        unstakeDelay: 60 * 60 * 24 * 7 // one week
      }
    },
  },
  kovanCompetition: {
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
          'MLN-T', 'WETH-T', 'MKR-T', 'DAI-T', 'ANT-T', 'ZRX-T',
          'BAT-T', 'DGD-T', 'GNO-T', 'OMG-T', 'JNT-T', 'REP-T', 'REQ-T', 'KNC-T'
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
