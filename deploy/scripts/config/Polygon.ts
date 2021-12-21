import { ChainlinkRateAsset } from '@enzymefinance/protocol';
import type { DeploymentConfig } from '@enzymefinance/testutils';
import { constants } from 'ethers';
import type { DeployFunction } from 'hardhat-deploy/types';

import { saveConfig } from '../../utils/config';
import { isMatic } from '../../utils/helpers';

// Special assets
const mln = constants.AddressZero; // todo: update once we have MLN on MATIC
const weth = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
const wmatic = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const wrappedNativeAsset = wmatic;
const feeToken = mln;

// WETH is not included as it is auto-included in the chainlink price feed
const primitives = {
  '1inch': '0x9c2c5fd7b07e95ee044ddeba0e97a665f142394f',
  aave: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
  // alcx: '',
  // axs: '',
  // badger: '',
  bal: '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3',
  bat: '0x3cef98bb43d732e2f285ee605a8158cde967d219',
  // bnt: '',
  // bond: '',
  bzrx: '0x54cfe73f2c7d0c4b62ab869b473f5512dc0944d2',
  cel: '0xd85d1e945766fea5eda9103f918bd915fbca63e6',
  // chz: '',
  comp: '0x8505b9d2254a7ae468c0e9dd10ccea3a837aef5c',
  crv: '0x172370d5cd63279efa6d502dab29171933a610af',
  dai: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  // dodo: '',
  // dpi: '',
  enj: '0x7ec26842f195c852fa843bb9f6d8b583a274a157',
  // farm: '',
  frax: '0x45c32fa6df82ead1e2ef74d17b76547eddfaff89',
  fxs: '0x1a3acf6d19267e2d3e7f898f42803e90c9219062',
  ghst: '0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7',
  knc: '0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c',
  link: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39',
  // lpt: '',
  mana: '0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4',
  // mft: '',
  mkr: '0x6f7C932e7684666C9fd1d44527765433e01fF61d',
  nexo: '0x41b3966b4ff7b427969ddf5da3627d6aeae9a48e',
  // ohm: '',
  // omg: '',
  // pax: '',
  // paxg: '',
  quick: '0x831753dd7087cac61ab5644b308642cc1c33dc13',
  // rep: '',
  snx: '0x50b728d8d964fd00c2d0aad81718b71311fef68a',
  sushi: '0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a',
  uma: '0x3066818837c5e6ed6601bd5a91b0762877a6b731',
  uni: '0xb33eaad8d922b1083446dc23f610c2567fb5180f',
  usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  wbtc: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
  wmatic,
  // xsushi: '',
  yfi: '0xda537104d6a5edd53c6fbba9a898708e465260b6',
  // zrx: '',
} as const;

const aggregators = {
  '1inch': ['0x443C5116CdF663Eb387e72C688D276e702135C87', ChainlinkRateAsset.USD],
  aave: ['0x72484B12719E23115761D5DA1646945632979bB6', ChainlinkRateAsset.USD],
  alcx: ['0x5DB6e61B6159B20F068dc15A47dF2E5931b14f29', ChainlinkRateAsset.USD],
  axs: ['0x9c371aE34509590E10aB98205d2dF5936A1aD875', ChainlinkRateAsset.USD],
  badger: ['0xF626964Ba5e81405f47e8004F0b276Bb974742B5', ChainlinkRateAsset.USD],
  bal: ['0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66', ChainlinkRateAsset.USD],
  bat: ['0x2346Ce62bd732c62618944E51cbFa09D985d86D2', ChainlinkRateAsset.USD],
  bnt: ['0xF5724884b6E99257cC003375e6b844bC776183f9', ChainlinkRateAsset.USD],
  bond: ['0x58527C2dCC755297bB81f9334b80b2B6032d8524', ChainlinkRateAsset.USD],
  bzrx: ['0x6b7D436583e5fE0874B7310b74D29A13af816860', ChainlinkRateAsset.USD],
  cel: ['0xc9ECF45956f576681bDc01F79602A79bC2667B0c', ChainlinkRateAsset.USD],
  chz: ['0x2409987e514Ad8B0973C2b90ee1D95051DF0ECB9', ChainlinkRateAsset.USD],
  comp: ['0x2A8758b7257102461BC958279054e372C2b1bDE6', ChainlinkRateAsset.USD],
  crv: ['0x336584C8E6Dc19637A5b36206B1c79923111b405', ChainlinkRateAsset.USD],
  dai: ['0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D', ChainlinkRateAsset.USD],
  dodo: ['0x59161117086a4C7A9beDA16C66e40Bdaa1C5a8B6', ChainlinkRateAsset.USD],
  dpi: ['0x2e48b7924FBe04d575BA229A59b64547d9da16e9', ChainlinkRateAsset.USD],
  enj: ['0x440A341bbC9FA86aA60A195e2409a547e48d4C0C', ChainlinkRateAsset.USD],
  farm: ['0xDFb138ba3A6CCe675A6F5961323Be31eE42E40ff', ChainlinkRateAsset.USD],
  frax: ['0x00DBeB1e45485d53DF7C2F0dF1Aa0b6Dc30311d3', ChainlinkRateAsset.USD],
  fxs: ['0x6C0fe985D3cAcbCdE428b84fc9431792694d0f51', ChainlinkRateAsset.USD],
  ghst: ['0xe638249AF9642CdA55A92245525268482eE4C67b', ChainlinkRateAsset.ETH],
  knc: ['0x10e5f3DFc81B3e5Ef4e648C4454D04e79E1E41E2', ChainlinkRateAsset.USD],
  link: ['0xd9FFdb71EbE7496cC440152d43986Aae0AB76665', ChainlinkRateAsset.USD],
  lpt: ['0xBAaF11CeDA1d1Ca9Cf01748F8196653c9656a400', ChainlinkRateAsset.USD],
  mana: ['0xA1CbF3Fe43BC3501e3Fc4b573e822c70e76A7512', ChainlinkRateAsset.USD],
  mft: ['0x6E53C1c22427258BE55aE985a65c0C87BB631F9C', ChainlinkRateAsset.USD],
  mkr: ['0xa070427bF5bA5709f70e98b94Cb2F435a242C46C', ChainlinkRateAsset.USD],
  nexo: ['0x666bb13b3ED3816504E8c30D0F9B9C16b371774b', ChainlinkRateAsset.USD],
  ohm: ['0xa8B05B6337040c0529919BDB51f6B40A684eb08C', ChainlinkRateAsset.USD],
  omg: ['0x93FfEE768F74208a7b9f2a4426f0F6BCbb1D09de', ChainlinkRateAsset.USD],
  pax: ['0x56D55D34EcC616e71ae998aCcba79F236ff2ff46', ChainlinkRateAsset.USD],
  paxg: ['0x0f6914d8e7e1214CDb3A4C6fbf729b75C69DF608', ChainlinkRateAsset.USD],
  quick: ['0xa058689f4bCa95208bba3F265674AE95dED75B6D', ChainlinkRateAsset.USD],
  rep: ['0x634b084372f88848aC8F8006DC178aA810A58E89', ChainlinkRateAsset.USD],
  rgt: ['0xFBa8B14D9885517cc06F63Cf4Dd2B655D62F1Be0', ChainlinkRateAsset.ETH],
  sand: ['0x3D49406EDd4D52Fb7FFd25485f32E073b529C924', ChainlinkRateAsset.USD],
  snx: ['0xbF90A5D9B6EE9019028dbFc2a9E50056d5252894', ChainlinkRateAsset.USD],
  sushi: ['0x49B0c695039243BBfEb8EcD054EB70061fd54aa0', ChainlinkRateAsset.USD],
  uma: ['0x33D9B1BAaDcF4b26ab6F8E83e9cb8a611B2B3956', ChainlinkRateAsset.USD],
  uni: ['0xdf0Fb4e4F928d2dCB76f438575fDD8682386e13C', ChainlinkRateAsset.USD],
  usdc: ['0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7', ChainlinkRateAsset.USD],
  usdt: ['0x0A6513e40db6EB1b165753AD52E80663aeA50545', ChainlinkRateAsset.USD],
  wbtc: ['0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6', ChainlinkRateAsset.USD],
  wmatic: ['0xAB594600376Ec9fD91F8e885dADF0CE036862dE0', ChainlinkRateAsset.USD],
  xsushi: ['0xC16Cb62CddE46f43Fd73257b957Bf527f07b51C0', ChainlinkRateAsset.USD],
  yfi: ['0x9d3A43c111E7b2C6601705D9fcF7a70c95b1dc55', ChainlinkRateAsset.USD],
  zrx: ['0x6EA4d89474d9410939d429B786208c74853A5B47', ChainlinkRateAsset.USD],
} as const;
const ethUsdAggregator = '0xF9680D99D6C9589e2a93a78A04A279e509205945';

const atokens = {
  aaave: ['0x1d2a0E5EC8E5bBDCA5CB219e649B565d8e5c3360', primitives.aave] as [string, string],
  adai: ['0x27F8D03b3a2196956ED754baDc28D73be8830A6e', primitives.dai] as [string, string],
  ausdc: ['0x1a13F4Ca1d028320A707D99520AbFefca3998b7F', primitives.usdc] as [string, string],
  ausdt: ['0x60D55F02A771d515e077c9C2403a1ef324885CeC', primitives.usdt] as [string, string],
  awbtc: ['0x5c2ed810328349100A66B82b78a1791B101C9D61', primitives.wbtc] as [string, string],
  aweth: ['0x28424507fefb6f7f8E9D3860F56504E4e5f5f390', weth] as [string, string],
  awmatic: ['0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4', primitives.wmatic] as [string, string],
};

// prettier-ignore
const mainnetConfig: DeploymentConfig = {
  aave: {
    atokens,
    lendingPoolAddressProvider: '0xd05e3E715d945B59290df0ae8eF85c1BdB684744',
    protocolDataProvider: '0x7551b5D2763519d4e37e8B81929D336De671d46d',
  },
  chainlink: {
    aggregators,
    ethusd: ethUsdAggregator,
  },
  feeToken,
  gsn: {
    relayHub: '0x6C28AfC105e65782D9Ea6F2cA68df84C9e7d750d',
    relayWorker: constants.AddressZero,
    trustedForwarder: '0x14c6b99AfFC61e9b0753146F3437A223d0c58279',
  },
  paraSwapV5: {
    augustusSwapper: '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57',
    tokenTransferProxy: '0x216B4B4Ba9F3e719726886d34a177484278Bfcae',
  },
  primitives,
  weth,
  wrappedNativeAsset
} as any as DeploymentConfig

const fn: DeployFunction = async (hre) => {
  await saveConfig(hre, mainnetConfig);
};

fn.tags = ['Config'];
fn.skip = async (hre) => {
  // Run this only for polygon.
  const chain = await hre.getChainId();

  return !isMatic(chain);
};

export default fn;
