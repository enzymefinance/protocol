module.exports = {
  track: 'KYBER_PRICE',
  accounts: ['0xC0c82081f2Ad248391cd1483ae211d56c280887a'],
  initialWethDepositAmount: '10000000000000000000',
  oasisDexCloseTime: '99999999999999',
  zeroExV3ProtocolFeeMultiplier: 150000,
  kyberRateDuration: 500000,
  kyberAdmin: '0x9d1dB7bb85dcE740e92668547F23EcfE55d8572b',
  kyberOperator: '0x8180a5CA4E3B94045e05A9313777955f7518D757',
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
  melonMaxPriceDeviation: '100000000000000000',
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
  },
  whales: {
    WETH: '0x07320deb2713370a3d7b49189fc2f99906e1ae8e',
    MLN: '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d',
    ANT: '0xfbb1b73c4f0bda4f67dca266ce6ef42f520fbb98',
    BAT: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    DAI: '0x07bb41df8c1d275c4259cdd0dbf0189d6a9a5f32',
    KNC: '0x3eb01b3391ea15ce752d01cf3d3f09dec596f650',
    LINK: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    MANA: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    MKR: '0xf37216a8ac034d08b4663108d7532dfcb44583ed',
    REP: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    REN: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    RLC: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
    SAI: '0x76af586d041d6988cdba95347e2f857872524fea',
    USDC: '0x92d7796c04ee34d1d16c57fab92fc2bccf434468',
    WBTC: '0x447a9652221f46471a2323b98b73911cda58fd8a',
    ZRX: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8'
  }
};
