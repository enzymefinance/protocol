import { utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  encodeZeroExV2AssetData,
  CentralizedRateProviderArgs,
  MockChaiIntegrateeArgs,
  MockKyberIntegrateeArgs,
  MockParaSwapIntegrateeArgs,
  MockZeroExV2IntegrateeArgs,
  MockSynthetixPriceSourceArgs,
  MockSynthetixIntegrateeArgs,
  MockSynthetixIntegratee,
  MockUniswapV2IntegrateeArgs,
  ChainlinkRateAsset,
  MockSynthetixPriceSource,
} from '@melonproject/protocol';
import {
  deployMock,
  createDeployMockToken,
  createDeployMockSynthetixToken,
  createDeployMockCompoundToken,
  createDeployMockUniswapPair,
  saveMockDeployment,
} from './Mocks';

const ethUsdAggregator = '0x9326BFA02ADD2366b30bacB125260Af641031331';
const xauUsdAggregator = '0xc8fb5684f2707C82f28595dEaC017Bfdf44EE9c5';

const chainlinkAggregators = {
  bat: ['0x0e4fcEC26c9f85c3D714370c98f43C4E02Fc35Ae', ChainlinkRateAsset.ETH],
  bnb: ['0x8993ED705cdf5e84D0a3B754b5Ee0e1783fcdF16', ChainlinkRateAsset.USD],
  busd: ['0xbF7A18ea5DE0501f7559144e702b29c55b055CcB', ChainlinkRateAsset.ETH],
  bzrx: ['0x9aa9da35DC44F93D90436BfE256f465f720c3Ae5', ChainlinkRateAsset.ETH],
  dai: ['0x777A68032a88E5A84678A77Af2CD65A7b3c0775a', ChainlinkRateAsset.USD],
  snx: ['0xF9A76ae7a1075Fe7d646b06fF05Bd48b9FA5582e', ChainlinkRateAsset.ETH],
  enj: ['0xfaDbe2ee798889F02d1d39eDaD98Eff4c7fe95D4', ChainlinkRateAsset.ETH],
  knc: ['0xb8E8130d244CFd13a75D6B9Aee029B1C33c808A7', ChainlinkRateAsset.ETH],
  link: ['0x3Af8C569ab77af5230596Acf0E8c2F9351d24C38', ChainlinkRateAsset.ETH],
  mana: ['0x1b93D8E109cfeDcBb3Cc74eD761DE286d5771511', ChainlinkRateAsset.ETH],
  // mkr: ['0x0B156192e04bAD92B6C1C13cf8739d14D78D5701', ChainlinkRateAsset.ETH],
  // ren: ['0xF1939BECE7708382b5fb5e559f630CB8B39a10ee', ChainlinkRateAsset.ETH],
  rep: ['0x3A7e6117F2979EFf81855de32819FBba48a63e9e', ChainlinkRateAsset.ETH],
  // uni: ['0x17756515f112429471F86f98D5052aCB6C47f6ee', ChainlinkRateAsset.ETH],
  usdc: ['0x64EaC61A2DFda2c3Fa04eED49AA33D021AeC8838', ChainlinkRateAsset.ETH],
  usdt: ['0x0bF499444525a23E7Bb61997539725cA2e928138', ChainlinkRateAsset.ETH],
  wbtc: ['0xF7904a295A029a3aBDFFB6F12755974a958C7C25', ChainlinkRateAsset.ETH],
  // yfi: ['0xC5d1B1DEb2992738C0273408ac43e1e906086B6C', ChainlinkRateAsset.ETH],
  zrx: ['0xBc3f28Ccc21E9b5856E81E6372aFf57307E2E883', ChainlinkRateAsset.ETH],
  susd: ['0xb343e7a1aF578FA35632435243D814e7497622f7', ChainlinkRateAsset.ETH],
  sdefi: ['0x70179FB2F3A0a5b7FfB36a235599De440B0922ea', ChainlinkRateAsset.USD],
} as const;

const fn: DeployFunction = async function (hre) {
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const centralizedRateProvider = await deployMock(hre, {
    contract: 'CentralizedRateProvider',
    args: [5] as CentralizedRateProviderArgs,
  });

  const deployMockToken = createDeployMockToken(hre);
  const deployMockSynthetixToken = createDeployMockSynthetixToken(hre);
  const deployMockCompoundToken = createDeployMockCompoundToken(hre, centralizedRateProvider.address);
  const deployMockUniswapPair = createDeployMockUniswapPair(hre);

  // WETH
  const weth = await deployMockToken('WETH', 'Wrapped Ether', 18);

  // PRIMITIVES
  const bat = await deployMockToken('BAT', 'Basic Attention Token', 18);
  const bnb = await deployMockToken('BNB', 'BNB', 18);
  const busd = await deployMockToken('BUSD', 'Binance USD', 18);
  const bzrx = await deployMockToken('BZRX', 'bZx Protocol Token', 18);
  const dai = await deployMockToken('DAI', 'Dai Stablecoin', 18);
  const snx = await deployMockToken('SNX', 'Synthetix Network Token', 18);
  const enj = await deployMockToken('ENJ', 'Enjin Coin', 18);
  const knc = await deployMockToken('KNC', 'Kyber Network Crystal', 18);
  const link = await deployMockToken('LINK', 'ChainLink Token', 18);
  const mana = await deployMockToken('MANA', 'Decentraland MANA', 18);
  // const mkr = await deployMockToken('MKR', 'Maker', 18);
  // const ren = await deployMockToken('REN', 'Republic Token', 18);
  const rep = await deployMockToken('REP', 'Reputation', 18);
  // const uni = await deployMockToken('UNI', 'Uniswap', 18);
  const usdc = await deployMockToken('USDC', 'USD Coin', 6);
  const usdt = await deployMockToken('USDT', 'Tether USD', 6);
  const wbtc = await deployMockToken('WBTC', 'Wrapped BTC', 8);
  // const yfi = await deployMockToken('YFI', 'yearn.finance', 18);
  const zrx = await deployMockToken('ZRX', '0x Protocol Token', 18);

  // WDGLD
  const wdgld = await deployMockToken('wDGLD', 'wrapped-DGLD', 8);

  // SYNTHETIX
  const sdefi = await deployMockSynthetixToken('sDEFI', 'Synth sDEFI', 18);
  const susd = await deployMockSynthetixToken('sUSD', 'Synth sUSD', 18);

  // COMPOUND
  // TODO: cETH should be its own mock contract type (currently uses MockCTokenIntegratee).
  const ceth = await deployMockCompoundToken('cETH', 'Compound Ether', 8, weth.address, 1);
  const cbat = await deployMockCompoundToken('cBAT', 'Compound Basic Attention Token', 18, bat.address, 1);
  const cdai = await deployMockCompoundToken('cDAI', 'Compound Dai', 8, dai.address, 1);
  const crep = await deployMockCompoundToken('cREP', 'Compound Augur', 8, rep.address, 1);
  // const cuni = await deployMockCompoundToken('cUNI', 'Compound Uniswap', 8, uni.address, 1);
  const cusdc = await deployMockCompoundToken('cUSDC', 'Compound USD Coin', 8, usdc.address, 1);
  const cusdt = await deployMockCompoundToken('cUSDT', 'Compound USDT', 8, usdt.address, 1);
  const cwbtc = await deployMockCompoundToken('cWBTC', 'Compound Wrapped BTC', 8, wbtc.address, 1);
  const czrx = await deployMockCompoundToken('cZRX', 'Compound 0x', 8, zrx.address, 1);

  // UNISWAP PAIRS
  const uniswapPairs = [
    [bat, weth, await deployMockUniswapPair('BAT-WETH', bat.address, weth.address)],
    [busd, usdc, await deployMockUniswapPair('BUSD-USDC', busd.address, usdc.address)],
    [bzrx, weth, await deployMockUniswapPair('BZRX-WETH', bzrx.address, weth.address)],
    [dai, usdc, await deployMockUniswapPair('DAI-USDC', dai.address, usdc.address)],
    [dai, usdt, await deployMockUniswapPair('DAI-USDT', dai.address, usdt.address)],
    [dai, weth, await deployMockUniswapPair('DAI-WETH', dai.address, weth.address)],
    [link, weth, await deployMockUniswapPair('LINK-WETH', link.address, weth.address)],
    [mana, weth, await deployMockUniswapPair('MANA-WETH', mana.address, weth.address)],
    // [mkr, weth, await deployMockUniswapPair('MKR-WETH', mkr.address, weth.address)],
    // [ren, weth, await deployMockUniswapPair('REN-WETH', ren.address, weth.address)],
    [snx, weth, await deployMockUniswapPair('SNX-WETH', snx.address, weth.address)],
    // [uni, weth, await deployMockUniswapPair('UNI-WETH', uni.address, weth.address)],
    [usdc, usdt, await deployMockUniswapPair('USDC-USDT', usdc.address, usdt.address)],
    [usdc, weth, await deployMockUniswapPair('USDC-WETH', usdc.address, weth.address)],
    [wbtc, usdc, await deployMockUniswapPair('WBTC-USDC', wbtc.address, usdc.address)],
    [wbtc, usdt, await deployMockUniswapPair('WBTC-USDT', wbtc.address, usdt.address)],
    [wbtc, weth, await deployMockUniswapPair('WBTC-WETH', wbtc.address, weth.address)],
    [weth, enj, await deployMockUniswapPair('WETH-ENJ', weth.address, enj.address)],
    [weth, knc, await deployMockUniswapPair('WETH-KNC', weth.address, knc.address)],
    [weth, usdt, await deployMockUniswapPair('WETH-USDT', weth.address, usdt.address)],
    [weth, zrx, await deployMockUniswapPair('WETH-ZRX', weth.address, zrx.address)],
    // [yfi, weth, await deployMockUniswapPair('YFI-WETH', yfi.address, weth.address)],
  ];

  const uniswapIntegratee = await deployMock(hre, {
    contract: 'MockUniswapV2Integratee',
    args: [
      uniswapPairs.map(([a]) => a.address),
      uniswapPairs.map(([, b]) => b.address),
      uniswapPairs.map(([, , pair]) => pair.address),
      centralizedRateProvider.address,
      0,
    ] as MockUniswapV2IntegrateeArgs,
  });

  const chaiPriceSource = await deployMock(hre, {
    contract: 'MockChaiPriceSource',
  });

  const chaiIntegratee = await deployMock(hre, {
    contract: 'MockChaiIntegratee',
    args: [dai.address, centralizedRateProvider.address, 18] as MockChaiIntegrateeArgs,
  });

  const kyberIntegratee = await deployMock(hre, {
    contract: 'MockKyberIntegratee',
    args: [centralizedRateProvider.address, weth.address, 0] as MockKyberIntegrateeArgs,
  });

  const paraSwapIntegratee = await deployMock(hre, {
    contract: 'MockParaSwapIntegratee',
    args: [centralizedRateProvider.address, 0] as MockParaSwapIntegrateeArgs,
  });

  const zeroExIntegratee = await deployMock(hre, {
    contract: 'MockZeroExV2Integratee',
    args: [encodeZeroExV2AssetData(zrx.address)] as MockZeroExV2IntegrateeArgs,
  });

  const synthetixPriceSource = await deployMock(hre, {
    contract: 'MockSynthetixPriceSource',
    args: [ethUsdAggregator] as MockSynthetixPriceSourceArgs,
  });

  const synthetixIntegratee = await deployMock(hre, {
    contract: 'MockSynthetixIntegratee',
    args: [5, synthetixPriceSource.address] as MockSynthetixIntegrateeArgs,
  });

  const synthetixPriceSourceInstance = new MockSynthetixPriceSource(synthetixPriceSource.address, deployer);
  const synthetixIntegrateeInstance = new MockSynthetixIntegratee(synthetixIntegratee.address, deployer);

  const synthetixSynths = [
    ['sUSD', susd.address, ...chainlinkAggregators.susd],
    ['sDEFI', sdefi.address, ...chainlinkAggregators.sdefi],
  ] as const;

  const synthetixCurrencyKeys = synthetixSynths.map(([symbol]) => utils.formatBytes32String(symbol));
  const synthetixAddresses = synthetixSynths.map(([, address]) => address);
  const synthetixAggregators = synthetixSynths.map(([, , aggregator]) => aggregator);
  const synthetixRateAssets = synthetixSynths.map(([, , , rateAsset]) => rateAsset);

  await synthetixIntegrateeInstance.setSynthFromCurrencyKeys(synthetixCurrencyKeys, synthetixAddresses);

  // NOTE: On the testnet mock deployment, we use chainlink aggregators for updating the prices of
  // synthetix assets for simplicity.
  await synthetixPriceSourceInstance.setPriceSourcesForCurrencyKeys(
    synthetixCurrencyKeys,
    synthetixAggregators,
    synthetixRateAssets,
  );

  await saveMockDeployment(hre, 'Kovan', {
    weth: weth.address,
    chainlink: {
      ethusd: ethUsdAggregator,
      primitives: [
        [bat.address, ...chainlinkAggregators.bat],
        [bnb.address, ...chainlinkAggregators.bnb],
        [busd.address, ...chainlinkAggregators.busd],
        [bzrx.address, ...chainlinkAggregators.bzrx],
        [dai.address, ...chainlinkAggregators.dai],
        [snx.address, ...chainlinkAggregators.snx],
        [enj.address, ...chainlinkAggregators.enj],
        [knc.address, ...chainlinkAggregators.knc],
        [link.address, ...chainlinkAggregators.link],
        [mana.address, ...chainlinkAggregators.mana],
        // [mkr.address, ...chainlinkAggregators.mkr],
        // [ren.address, ...chainlinkAggregators.ren],
        [rep.address, ...chainlinkAggregators.rep],
        // [uni.address, ...chainlinkAggregators.uni],
        [usdc.address, ...chainlinkAggregators.usdc],
        [usdt.address, ...chainlinkAggregators.usdt],
        [wbtc.address, ...chainlinkAggregators.wbtc],
        // [yfi.address, ...chainlinkAggregators.yfi],
        [zrx.address, ...chainlinkAggregators.zrx],
        [susd.address, ...chainlinkAggregators.susd],
      ],
    },
    wdgld: {
      wdgld: wdgld.address,
      ethusd: ethUsdAggregator,
      xauusd: xauUsdAggregator,
    },
    synthetix: {
      snx: snx.address,
      susd: susd.address,
      synths: [sdefi.address],
      addressResolver: synthetixIntegratee.address,
      delegateApprovals: synthetixIntegratee.address,
      originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
      trackingCode: utils.formatBytes32String('ENZYME'),
    },
    compound: {
      ceth: ceth.address,
      ctokens: [
        cbat.address,
        cdai.address,
        crep.address,
        // cuni.address,
        cusdc.address,
        cusdt.address,
        cwbtc.address,
        czrx.address,
      ],
    },
    chai: {
      dai: dai.address,
      chai: chaiIntegratee.address,
      pot: chaiPriceSource.address,
    },
    kyber: {
      networkProxy: kyberIntegratee.address,
    },
    paraswap: {
      augustusSwapper: paraSwapIntegratee.address,
      tokenTransferProxy: paraSwapIntegratee.address,
    },
    uniswap: {
      factory: uniswapIntegratee.address,
      router: uniswapIntegratee.address,
      pools: uniswapPairs.map(([, , pair]) => pair.address),
    },
    zeroex: {
      exchange: zeroExIntegratee.address,
      allowedMakers: [],
    },
    policies: {
      guaranteedRedemption: {
        redemptionWindowBuffer: 300,
      },
    },
  });
};

fn.tags = ['Config'];
fn.skip = async (hre) => {
  // Skip this deployment script if we are not on kovan.
  if (hre.network.name !== 'kovan') {
    return true;
  }

  return false;
};

export default fn;
