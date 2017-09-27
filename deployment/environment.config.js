module.exports = {
  kovan: {
    networkId: '42',
    host: 'localhost',
    port: 8545,
    gas: 6900000,
    gasPrice: 100000000000,
    protocol: {
      registrar: {
        assetsToRegister = [
          'ANT-T', 'BNT-T', 'BAT-T', 'BTC-T', 'DGD-T', 'DOGE-T', 'ETC-T', 'ETH-T', 'EUR-T',
          'GNO-T', 'GNT-T', 'ICN-T', 'LTC-T', 'REP-T', 'XRP-T', 'SNGLS-T', 'SNT-T', 'MLN-T',
        ],
        ipfsHash = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b',
        chainId = '0x86b5eed81d000000000000000000000000000000000000000000000000000000',
        breakIn = '0x00360d2b7d240ec0643b6d819ba81a09e40e5bcd',
        breakOut = '0x00360d2b7d240ec0643b6d819ba81a09e40e5bcd',
      },
      datafeed: {
        interval = 120,
        validity = 60,
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
        assetsToRegister = [
          'ANT-T', 'BNT-T', 'BAT-T', 'BTC-T', 'DGD-T', 'DOGE-T', 'ETC-T', 'ETH-T', 'EUR-T',
          'GNO-T', 'GNT-T', 'ICN-T', 'LTC-T', 'REP-T', 'XRP-T', 'SNGLS-T', 'SNT-T', 'MLN-T',
        ],
        ipfsHash = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b',
        chainId = '0x86b5eed81d000000000000000000000000000000000000000000000000000000',
        breakIn = '0x00360d2b7d240ec0643b6d819ba81a09e40e5bcd',
        breakOut = '0x00360d2b7d240ec0643b6d819ba81a09e40e5bcd',
      },
      datafeed: {
        interval = 120,
        validity = 60,
      },
    },    
  },
}
