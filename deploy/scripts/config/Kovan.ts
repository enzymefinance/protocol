import { ChainlinkRateAsset, sighash } from '@enzymefinance/protocol';
import { utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { DeploymentConfig, saveConfig } from '../../utils/config';

// Note that some addresses in this file are checksummed and others are not. This shouldn't be an issue.

// WETH is not included as it is auto-included in the chainlink price feed
const primitives = {
  bat: '0x2e62eaaf0f490219be8ed376326e0516228bae89',
  bnb: '0x4674e9587925f9fb4d3a4cc5591029596280e00c',
  busd: '0x88dd7a403a3d48625c9cb511ff47d1d6c25eb121',
  bzrx: '0x23cb26e7bc6868452097e351e42d2a39c861b6bb',
  dai: '0x0707de6ea02d4558fea1e0a96cad9003f8c1d384',
  enj: '0x1dc1216b3d1803a0b5f7664b7756377f477614ab',
  knc: '0x902aaefd695f2af5ccfa6a027051261976131d69',
  link: '0xd7f19f0d395e8c7d5368d74a81b774e2b822df25',
  mana: '0x7c52405ada0bfbca32a81703862a03757fb702f7',
  mkr: '0xde016fea21895e5aca1112b95504f303500002b5',
  ren: '0xd9436124f61685e63cd87370d1a9b32e79b75601',
  rep: '0x56a7c6766b5e7a9e6bc704f7becc001f2755a713',
  snx: '0x4c22d46c07ab880f94e8213e0256727af471a9f4',
  susd: '0x190cece40aef39a2a15d8858cafa691f01a909c5',
  uni: '0x86684577af5598b229a27c5774b658d303e2e044',
  usdc: '0xfac5cbefa43a877c675e8007a685e0d72ee1f109',
  usdt: '0x50e7615a526f715556c478749303c75571f1e6b5',
  wbtc: '0x08adedfb5f473a7dffd05da2c0f33651553668a9',
  yfi: '0x3a854556f28f77dcc803538032ca64fdf42a0783',
  zrx: '0x8955cd6b7826a86e820f0774278d89b76db25c46',
} as const;

const weth = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';

const aggregators = {
  bat: ['0x0e4fcec26c9f85c3d714370c98f43c4e02fc35ae', ChainlinkRateAsset.ETH],
  bnb: ['0x8993ed705cdf5e84d0a3b754b5ee0e1783fcdf16', ChainlinkRateAsset.USD],
  busd: ['0xbf7a18ea5de0501f7559144e702b29c55b055ccb', ChainlinkRateAsset.ETH],
  bzrx: ['0x9aa9da35dc44f93d90436bfe256f465f720c3ae5', ChainlinkRateAsset.ETH],
  dai: ['0x777a68032a88e5a84678a77af2cd65a7b3c0775a', ChainlinkRateAsset.ETH],
  enj: ['0xfadbe2ee798889f02d1d39edad98eff4c7fe95d4', ChainlinkRateAsset.ETH],
  knc: ['0xb8e8130d244cfd13a75d6b9aee029b1c33c808a7', ChainlinkRateAsset.ETH],
  link: ['0x3af8c569ab77af5230596acf0e8c2f9351d24c38', ChainlinkRateAsset.ETH],
  mana: ['0x1b93d8e109cfedcbb3cc74ed761de286d5771511', ChainlinkRateAsset.ETH],
  mkr: ['0x0b156192e04bad92b6c1c13cf8739d14d78d5701', ChainlinkRateAsset.ETH],
  ren: ['0xf1939bece7708382b5fb5e559f630cb8b39a10ee', ChainlinkRateAsset.ETH],
  rep: ['0x3a7e6117f2979eff81855de32819fbba48a63e9e', ChainlinkRateAsset.ETH],
  snx: ['0xf9a76ae7a1075fe7d646b06ff05bd48b9fa5582e', ChainlinkRateAsset.ETH],
  susd: ['0xb343e7a1af578fa35632435243d814e7497622f7', ChainlinkRateAsset.ETH],
  uni: ['0x17756515f112429471f86f98d5052acb6c47f6ee', ChainlinkRateAsset.ETH],
  usdc: ['0x64eac61a2dfda2c3fa04eed49aa33d021aec8838', ChainlinkRateAsset.ETH],
  usdt: ['0x0bf499444525a23e7bb61997539725ca2e928138', ChainlinkRateAsset.ETH],
  wbtc: ['0xf7904a295a029a3abdffb6f12755974a958c7c25', ChainlinkRateAsset.ETH],
  yfi: ['0xc5d1b1deb2992738c0273408ac43e1e906086b6c', ChainlinkRateAsset.ETH],
  zrx: ['0xbc3f28ccc21e9b5856e81e6372aff57307e2e883', ChainlinkRateAsset.ETH],
} as const;

const synths = {
  sdefi: '0xf1762903953e3729335be6cf02b846501c9049a8',
} as const;

const ctokens = {
  cbat: '0xdbacce684dcd33af1a4da089b3173a5dedba7469',
  cdai: '0x9b19b1590b9289e5abbc7ee9511076be8d75ac42',
  crep: '0x9be41d202e8a1d7327b2fd860749e41baa89cb6a',
  cuni: '0x3e9867f6e41df327eae9d0832530d1007d1fbb4f',
  cusdc: '0x1ad7ecfb656ec99538db3bc46d66e7d79e9acc9e',
  cusdt: '0xab8b04c6f87a47aeef37b7bc82d39656549a3a29',
  cwbtc: '0x4f4a33bdc3e4b4b4cc25d8f1f29bc185b176e525',
  czrx: '0xcb37f0ce3ce7fa5545de084a41f2b18f76815a85',
} as const;

const atokens = {} as const;
const pools = {} as const;
const idle = {} as const;

const ethUsdAggregator = '0x9326bfa02add2366b30bacb125260af641031331';
const xauUsdAggregator = '0x0000000000000000000000000000000000000000';

const curveMinter = '0x0000000000000000000000000000000000000000';
const synthetixDelegateApprovals = '0x93a5c5c7547832c8ebfccabc2157d43a9c5e68d4';

// prettier-ignore
const mainnetConfig: DeploymentConfig = {
  aave: {
    atokens,
    lendingPoolAddressProvider: '0x0000000000000000000000000000000000000000',
    protocolDataProvider: '0x0000000000000000000000000000000000000000',
  },
  alphaHomoraV1: {
    ibeth: '0x0000000000000000000000000000000000000000'
  },
  chainlink: {
    aggregators,
    ethusd: ethUsdAggregator,
  },
  compound: {
    ceth: '0x651c7d880878c1febf485b3279d5883f41e24896',
    ctokens,
  },
  curve: {
    addressProvider: '0x0000000000000000000000000000000000000000',
    minter: curveMinter,
    pools: {
      aave: {
        invariantProxyAsset: primitives.usdc,
        liquidityGaugeToken: '0x0000000000000000000000000000000000000000',
        lpToken: '0x0000000000000000000000000000000000000000',
        pool: '0x0000000000000000000000000000000000000000'
      },
      seth: {
        invariantProxyAsset: weth,
        liquidityGaugeToken: '0x0000000000000000000000000000000000000000',
        lpToken: '0x0000000000000000000000000000000000000000',
        pool: '0x0000000000000000000000000000000000000000'
      },
      steth: {
        invariantProxyAsset: weth,
        liquidityGaugeToken: '0x0000000000000000000000000000000000000000',
        lpToken: '0x0000000000000000000000000000000000000000',
        pool: '0x0000000000000000000000000000000000000000'
      },
    },
  },
  idle,
  kyber: {
    networkProxy: '0x9AAb3f75489902f3a48495025729a0AF77d4b11e',
  },
  lido: {
    steth: '0x0000000000000000000000000000000000000000'
  },
  paraSwapV4: {
    augustusSwapper: '0x0000000000000000000000000000000000000000',
    tokenTransferProxy: '0x0000000000000000000000000000000000000000',
  },
  policies: {
    guaranteedRedemption: {
      redemptionWindowBuffer: 300,
    },
  },
  primitives,
  stakehound: {
    steth: '0x0000000000000000000000000000000000000000'
  },
  synthetix: {
    addressResolver: '0x93A5c5c7547832c8ebFcCAbc2157D43A9c5E68d4',
    delegateApprovals: synthetixDelegateApprovals,
    originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
    snx: primitives.snx,
    susd: primitives.susd,
    synths,
    trackingCode: '0x454e5a594d450000000000000000000000000000000000000000000000000000',
  },
  uniswap: {
    factory: '0x0022B151B637722757852Ef64c57c982277203fF',
    pools,
    router: '0x0022B151B637722757852Ef64c57c982277203fF',
  },
  wdgld: {
    ethusd: ethUsdAggregator,
    wdgld: '0x23993cA98c63F1f8de457C271f8ceFD9076A42f4',
    xauusd: xauUsdAggregator,
  },
  weth: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
  zeroex: {
    allowedMakers: [],
    exchange: '0x6Ffa4088e56986E25e65d73657C23D3A869EE570',
  },
  vaultCalls: [
    [
      synthetixDelegateApprovals,
      sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)')),
    ],
    [curveMinter, sighash(utils.FunctionFragment.fromString('mint(address)'))],
    [curveMinter, sighash(utils.FunctionFragment.fromString('mint_many(address[8])'))],
    [curveMinter, sighash(utils.FunctionFragment.fromString('toggle_approve_mint(address)'))],
  ],
}

const fn: DeployFunction = async (hre) => {
  await saveConfig(hre, mainnetConfig);
};

fn.tags = ['Config'];
fn.skip = async (hre) => {
  // Run this only for kovan.
  const chain = parseInt(await hre.getChainId());
  return chain !== 42;
};

export default fn;
