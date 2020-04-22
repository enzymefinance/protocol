module.exports = {
  track: 'TESTING',
  accounts: [
    '0xC0c82081f2Ad248391cd1483ae211d56c280887a'
  ],
  initialWethDepositAmount: '1000000000000000000000000',
  oasisDexCloseTime: '99999999999999',
  zeroExV3ProtocolFeeMultiplier: 150000,
  kyberRateDuration: 500000,
  kyberMinimalRecordResolution: 2,
  kyberMaxPerBlockImbalance: '100000000000000000000000000000',
  kyberMaxTotalImbalance: '1200000000000000000000000000000',
  kyberTokensToTransfer: '100000000000000000000000',
  kyberInitialReserveAmount: '1000000000000000000',
  kyberTokensPerEther: '1000000000000000000',
  kyberEthersPerToken: '1000000000000000000',
  kyberCategoryCap: '1000000000000000000000000000',
  melonPriceTolerance: 10,
  melonUserWhitelist: ['0xc0c82081f2ad248391cd1483ae211d56c280887a'],
  melonRegistryOwner: '0xc0c82081f2ad248391cd1483ae211d56c280887a',
  melonEngineDelay: 2592000,
  melonMaxSpread: '100000000000000000',
  melonFundFactoryOwner: '0xc0c82081f2ad248391cd1483ae211d56c280887a',
  melonInitialMGM: '0xc0c82081f2ad248391cd1483ae211d56c280887a',
  melonVersionName: 'Fakename',
  tokens: {
    WETH: {
      name: 'Wrapped ether',
      decimals: 18,
      initialDepositAmount: '1000000000000000000000000'
    },
    MLN: {
      name: 'Melon Token',
      decimals: 18
    },
    DAI: {
      name: 'Dai',
      decimals: 18
    },
    EUR: {
      name: 'Euro Token',
      decimals: 18
    },
    KNC: {
      name: 'Kyber Network',
      decimals: 18
    },
    ZRX: {
      name: '0x protocol token',
      decimals: 18
    }
  }
};
