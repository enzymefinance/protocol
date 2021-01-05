import { utils } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ChainlinkRateAsset } from '@melonproject/protocol';
import { loadMockDeployment } from './Mocks';

export interface DeploymentConfig {
  weth: string;
  chainlink: {
    ethusd: string;
    primitives: [string, string, ChainlinkRateAsset][];
  };
  wdgld: {
    wdgld: string;
    ethusd: string;
    xauusd: string;
  };
  synthetix: {
    snx: string;
    susd: string;
    synths: string[];
    addressResolver: string;
    delegateApprovals: string;
    originator: string;
    trackingCode: string;
  };
  compound: {
    ceth: string;
    ctokens: string[];
  };
  chai: {
    dai: string;
    chai: string;
    pot: string;
  };
  kyber: {
    networkProxy: string;
  };
  paraswap: {
    augustusSwapper: string;
    tokenTransferProxy: string;
  };
  uniswap: {
    factory: string;
    router: string;
    pools: string[];
  };
  zeroex: {
    exchange: string;
    allowedMakers: string[];
  };
  policies: {
    guaranteedRedemption: {
      redemptionWindowBuffer: number;
    };
  };
}

const primitives = {
  bat: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
  bnb: '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
  bnt: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
  comp: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  knc: '0xdd974D5C2e2928deA5F71b9825b8b646686BD200',
  link: '0x514910771af9ca656af840dff83e8264ecf986ca',
  mana: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
  mln: '0xec67005c4E498Ec7f55E092bd1d35cbC47C91892',
  rep: '0x1985365e9f78359a9b6ad760e32412f4a445e862',
  ren: '0x408e41876cccdc0f92210600ef50372656052a38',
  uni: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  usdt: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  zrx: '0xE41d2489571d322189246DaFA5ebDe1F4699F498',
  susd: '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51',
} as const;

const chainlinkAggregators = {
  bat: ['0x0d8775f648430679a709e98d2b0cb6250d2887ef', ChainlinkRateAsset.ETH],
  bnb: ['0xB8c77482e45F1F44dE1745F52C74426C631bDD52', ChainlinkRateAsset.USD],
  bnt: ['0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c', ChainlinkRateAsset.ETH],
  comp: ['0xc00e94Cb662C3520282E6f5717214004A7f26888', ChainlinkRateAsset.ETH],
  dai: ['0x6B175474E89094C44Da98b954EedeAC495271d0F', ChainlinkRateAsset.ETH],
  knc: ['0xdd974D5C2e2928deA5F71b9825b8b646686BD200', ChainlinkRateAsset.ETH],
  link: ['0x514910771af9ca656af840dff83e8264ecf986ca', ChainlinkRateAsset.ETH],
  mana: ['0x0f5d2fb29fb7d3cfee444a200298f468908cc942', ChainlinkRateAsset.ETH],
  mln: ['0xec67005c4E498Ec7f55E092bd1d35cbC47C91892', ChainlinkRateAsset.ETH],
  rep: ['0x1985365e9f78359a9b6ad760e32412f4a445e862', ChainlinkRateAsset.ETH],
  ren: ['0x408e41876cccdc0f92210600ef50372656052a38', ChainlinkRateAsset.ETH],
  uni: ['0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', ChainlinkRateAsset.ETH],
  usdc: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', ChainlinkRateAsset.ETH],
  usdt: ['0xdac17f958d2ee523a2206206994597c13d831ec7', ChainlinkRateAsset.ETH],
  zrx: ['0xE41d2489571d322189246DaFA5ebDe1F4699F498', ChainlinkRateAsset.ETH],
  susd: ['0x57Ab1ec28D129707052df4dF418D58a2D46d5f51', ChainlinkRateAsset.ETH],
} as const;

const ethUsdAggregator = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
const xauUsdAggregator = '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6';

// prettier-ignore
const config: DeploymentConfig = {
  weth: '0xe08A8b19e5722a201EaF20A6BC595eF655397bd5',
  chainlink: {
    ethusd: ethUsdAggregator,
    primitives: [
      [primitives.bat, ...chainlinkAggregators.bat], // BAT
      [primitives.bnb, ...chainlinkAggregators.bnb], // BNB
      [primitives.bnt, ...chainlinkAggregators.bnt], // BNT
      [primitives.comp, ...chainlinkAggregators.comp], // COMP
      [primitives.dai, ...chainlinkAggregators.dai], // DAI
      [primitives.knc, ...chainlinkAggregators.knc], // KNC
      [primitives.link, ...chainlinkAggregators.link], // LINK
      [primitives.mana, ...chainlinkAggregators.mana], // MANA
      [primitives.mln, ...chainlinkAggregators.mln], // MLN
      [primitives.rep, ...chainlinkAggregators.rep], // REP
      [primitives.ren, ...chainlinkAggregators.ren], // REN
      [primitives.uni, ...chainlinkAggregators.uni], // UNI
      [primitives.usdc, ...chainlinkAggregators.usdc], // USDC
      [primitives.usdt, ...chainlinkAggregators.usdt], // USDT
      [primitives.zrx, ...chainlinkAggregators.zrx], // ZRX
      [primitives.susd, ...chainlinkAggregators.susd], // sUSD
    ],
  },
  wdgld: {
    wdgld: '0x123151402076fc819B7564510989e475c9cD93CA',
    ethusd: ethUsdAggregator,
    xauusd: xauUsdAggregator,
  },
  synthetix: {
    snx: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
    susd: primitives.susd,
    synths: [
      '0xF48e200EAF9906362BB1442fca31e0835773b8B4', // sAUD
      '0x617aeCB6137B5108D1E7D4918e3725C8cEbdB848', // sBNB
      '0xfe18be6b3bd88a2d2a7f928d00292e7a9963cfc6', // sBTC
    ],
    addressResolver: '0x61166014E3f04E40C953fe4EAb9D9E40863C83AE',
    delegateApprovals: '0x15fd6e554874B9e70F832Ed37f231Ac5E142362f',
    originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
    trackingCode: utils.formatBytes32String('ENZYME'),
  },
  compound: {
    ceth: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
    ctokens: [
      '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e', // cBAT
      '0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4', // cCOMP
      '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643', // cDAI
      '0x158079ee67fce2f58472a96584a73c7ab9ac95c1', // cREP
      '0x35A18000230DA775CAc24873d00Ff85BccdeD550', // cUNI
      '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
      '0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407', // cZRX
    ],
  },
  chai: {
    dai: primitives.dai,
    chai: '0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7',
    pot: '0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7',
  },
  kyber: {
    networkProxy: '0x9AAb3f75489902f3a48495025729a0AF77d4b11e',
  },
  paraswap: {
    augustusSwapper: '0x9509665d015Bfe3C77AA5ad6Ca20C8Afa1d98989',
    tokenTransferProxy: '0x0A87c89B5007ff406Ab5280aBdD80fC495ec238e',
  },
  uniswap: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    pools: [
      '0x15ab0333985FD1E289adF4fBBe19261454776642', // MLN-WETH
      '0xf49C43Ae0fAf37217bDcB00DF478cF793eDd6687', // KNC-WETH
      '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc', // USDC-WETH
    ],
  },
  zeroex: {
    exchange: '0x080bf510fcbf18b91105470639e9561022937712',
    allowedMakers: [], // TODO: Add allowed makers
  },
  policies: {
    guaranteedRedemption: {
      redemptionWindowBuffer: 300,
    },
  },
}

export async function loadConfig(hre: HardhatRuntimeEnvironment) {
  if (hre.network.name === 'mainnet') {
    return config;
  } else {
    return loadMockDeployment(hre);
  }
}

const fn: DeployFunction = async function () {
  // Nothing to do here.
};

fn.tags = ['Config'];
fn.dependencies = ['Mocks'];

export default fn;
