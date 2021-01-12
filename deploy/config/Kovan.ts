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
  CentralizedRateProvider,
  MockKyberIntegratee,
  MockUniswapV2Integratee,
} from '@enzymefinance/protocol';
import {
  deployMock,
  createDeployMockToken,
  createDeployMockSynthetixToken,
  createDeployMockCompoundToken,
  createDeployMockUniswapPair,
  createDeployMockCompoundEther,
} from './Mocks';
import { saveConfig } from './Config';

const weth = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
const ethUsdAggregator = '0x9326BFA02ADD2366b30bacB125260Af641031331';
const xauUsdAggregator = '0xc8fb5684f2707C82f28595dEaC017Bfdf44EE9c5';

const aggregators = {
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
  mkr: ['0x0B156192e04bAD92B6C1C13cf8739d14D78D5701', ChainlinkRateAsset.ETH],
  ren: ['0xF1939BECE7708382b5fb5e559f630CB8B39a10ee', ChainlinkRateAsset.ETH],
  rep: ['0x3A7e6117F2979EFf81855de32819FBba48a63e9e', ChainlinkRateAsset.ETH],
  uni: ['0x17756515f112429471F86f98D5052aCB6C47f6ee', ChainlinkRateAsset.ETH],
  usdc: ['0x64EaC61A2DFda2c3Fa04eED49AA33D021AeC8838', ChainlinkRateAsset.ETH],
  usdt: ['0x0bF499444525a23E7Bb61997539725cA2e928138', ChainlinkRateAsset.ETH],
  wbtc: ['0xF7904a295A029a3aBDFFB6F12755974a958C7C25', ChainlinkRateAsset.ETH],
  yfi: ['0xC5d1B1DEb2992738C0273408ac43e1e906086B6C', ChainlinkRateAsset.ETH],
  zrx: ['0xBc3f28Ccc21E9b5856E81E6372aFf57307E2E883', ChainlinkRateAsset.ETH],
  susd: ['0xb343e7a1aF578FA35632435243D814e7497622f7', ChainlinkRateAsset.ETH],
  sdefi: ['0x70179FB2F3A0a5b7FfB36a235599De440B0922ea', ChainlinkRateAsset.USD],
} as const;

const fn: DeployFunction = async function (hre) {
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const centralizedRateProvider = (
    await deployMock(hre, {
      contract: 'CentralizedRateProvider',
      args: [weth, 10] as CentralizedRateProviderArgs,
    })
  ).address;

  const centralizedRateProviderInstance = new CentralizedRateProvider(centralizedRateProvider, deployer);
  const currentMaxDeviation = await centralizedRateProviderInstance.getMaxDeviationPerSender();
  const maxDeviation = 10;
  if (!currentMaxDeviation.eq(maxDeviation)) {
    await centralizedRateProviderInstance.setMaxDeviationPerSender(maxDeviation);
  }

  const deployMockToken = createDeployMockToken(hre);
  const deployMockSynthetixToken = createDeployMockSynthetixToken(hre);
  const deployMockCompoundToken = createDeployMockCompoundToken(hre, centralizedRateProvider);
  const deployMockCompoundEther = createDeployMockCompoundEther(hre, centralizedRateProvider, weth);
  const deployMockUniswapPair = createDeployMockUniswapPair(hre, centralizedRateProvider);

  // PRIMITIVES
  const primitives = {
    bat: (await deployMockToken('BAT', 'Basic Attention Token', 18)).address,
    bnb: (await deployMockToken('BNB', 'BNB', 18)).address,
    busd: (await deployMockToken('BUSD', 'Binance USD', 18)).address,
    bzrx: (await deployMockToken('BZRX', 'bZx Protocol Token', 18)).address,
    dai: (await deployMockToken('DAI', 'Dai Stablecoin', 18)).address,
    snx: (await deployMockToken('SNX', 'Synthetix Network Token', 18)).address,
    enj: (await deployMockToken('ENJ', 'Enjin Coin', 18)).address,
    knc: (await deployMockToken('KNC', 'Kyber Network Crystal', 18)).address,
    link: (await deployMockToken('LINK', 'ChainLink Token', 18)).address,
    mana: (await deployMockToken('MANA', 'Decentraland MANA', 18)).address,
    mkr: (await deployMockToken('MKR', 'Maker', 18)).address,
    ren: (await deployMockToken('REN', 'Republic Token', 18)).address,
    rep: (await deployMockToken('REP', 'Reputation', 18)).address,
    uni: (await deployMockToken('UNI', 'Uniswap', 18)).address,
    usdc: (await deployMockToken('USDC', 'USD Coin', 6)).address,
    usdt: (await deployMockToken('USDT', 'Tether USD', 6)).address,
    wbtc: (await deployMockToken('WBTC', 'Wrapped BTC', 8)).address,
    yfi: (await deployMockToken('YFI', 'yearn.finance', 18)).address,
    zrx: (await deployMockToken('ZRX', '0x Protocol Token', 18)).address,
    susd: (await deployMockSynthetixToken('sUSD', 'Synth sUSD', 18)).address,
  };

  // WDGLD
  const wdgld = (await deployMockToken('wDGLD', 'wrapped-DGLD', 8)).address;

  // SYNTHS
  const synths = {
    sdefi: (await deployMockSynthetixToken('sDEFI', 'Synth sDEFI', 18)).address,
  };

  // COMPOUND
  const ceth = (await deployMockCompoundEther('cETH', 'Compound Ether', 200307431347120815233900023)).address;
  // prettier-ignore
  const ctokens = {
    cbat: (await deployMockCompoundToken('cBAT', 'Compound Basic Attention Token', primitives.bat, 204650501822922293956687133)).address,
    cdai: (await deployMockCompoundToken('cDAI', 'Compound Dai', primitives.dai, 209151253095207634720267576)).address,
    crep: (await deployMockCompoundToken('cREP', 'Compound Augur', primitives.rep, 200406592366310639162223313)).address,
    cuni: (await deployMockCompoundToken('cUNI', 'Compound Uniswap', primitives.uni, 201461772858910776917356020)).address,
    cusdc: (await deployMockCompoundToken('cUSDC', 'Compound USD Coin', primitives.usdc, 214132051581680)).address,
    cusdt: (await deployMockCompoundToken('cUSDT', 'Compound USDT', primitives.usdt, 205438026383237)).address,
    cwbtc: (await deployMockCompoundToken('cWBTC', 'Compound Wrapped BTC', primitives.wbtc, 20192119227582185)).address,
    czrx: (await deployMockCompoundToken('cZRX', 'Compound 0x', primitives.zrx, 203715368697685663551483532)).address,
  };

  // UNISWAP PAIRS
  // prettier-ignore
  const uniswapPairs = {
    batWeth: [primitives.bat, weth, (await deployMockUniswapPair('BAT-WETH', primitives.bat, weth)).address],
    busdUsdc: [primitives.busd, primitives.usdc, (await deployMockUniswapPair('BUSD-USDC', primitives.busd, primitives.usdc)).address],
    bzrxWeth: [primitives.bzrx, weth, (await deployMockUniswapPair('BZRX-WETH', primitives.bzrx, weth)).address],
    daiUsdc: [primitives.dai, primitives.usdc, (await deployMockUniswapPair('DAI-USDC', primitives.dai, primitives.usdc)).address],
    daiUsdt: [primitives.dai, primitives.usdt, (await deployMockUniswapPair('DAI-USDT', primitives.dai, primitives.usdt)).address],
    daiWeth: [primitives.dai, weth, (await deployMockUniswapPair('DAI-WETH', primitives.dai, weth)).address],
    linkWeth: [primitives.link, weth, (await deployMockUniswapPair('LINK-WETH', primitives.link, weth)).address],
    manaWeth: [primitives.mana, weth, (await deployMockUniswapPair('MANA-WETH', primitives.mana, weth)).address],
    mkrWeth: [primitives.mkr, weth, (await deployMockUniswapPair('MKR-WETH', primitives.mkr, weth)).address],
    renWeth: [primitives.ren, weth, (await deployMockUniswapPair('REN-WETH', primitives.ren, weth)).address],
    snxWeth: [primitives.snx, weth, (await deployMockUniswapPair('SNX-WETH', primitives.snx, weth)).address],
    uniWeth: [primitives.uni, weth, (await deployMockUniswapPair('UNI-WETH', primitives.uni, weth)).address],
    usdcUsdt: [primitives.usdc, primitives.usdt, (await deployMockUniswapPair('USDC-USDT', primitives.usdc, primitives.usdt)).address],
    usdcWeth: [primitives.usdc, weth, (await deployMockUniswapPair('USDC-WETH', primitives.usdc, weth)).address],
    wbtcUsdc: [primitives.wbtc, primitives.usdc, (await deployMockUniswapPair('WBTC-USDC', primitives.wbtc, primitives.usdc)).address],
    wbtcUsdt: [primitives.wbtc, primitives.usdt, (await deployMockUniswapPair('WBTC-USDT', primitives.wbtc, primitives.usdt)).address],
    wbtcWeth: [primitives.wbtc, weth, (await deployMockUniswapPair('WBTC-WETH', primitives.wbtc, weth)).address],
    wethEnj: [weth, primitives.enj, (await deployMockUniswapPair('WETH-ENJ', weth, primitives.enj)).address],
    wethKnc: [weth, primitives.knc, (await deployMockUniswapPair('WETH-KNC', weth, primitives.knc)).address],
    wethUsdt: [weth, primitives.usdt, (await deployMockUniswapPair('WETH-USDT', weth, primitives.usdt)).address],
    wethZrx: [weth, primitives.zrx, (await deployMockUniswapPair('WETH-ZRX', weth, primitives.zrx)).address],
    yfiWeth: [primitives.yfi, weth, (await deployMockUniswapPair('YFI-WETH', primitives.yfi, weth)).address],
  } as const;

  const uniswapPairValues = Object.values(uniswapPairs);
  const uniswapIntegratee = (
    await deployMock(hre, {
      contract: 'MockUniswapV2Integratee',
      args: [
        uniswapPairValues.map(([a]) => a),
        uniswapPairValues.map(([, b]) => b),
        uniswapPairValues.map(([, , pair]) => pair),
        centralizedRateProvider,
        0,
      ] as MockUniswapV2IntegrateeArgs,
    })
  ).address;

  const chaiPriceSource = (
    await deployMock(hre, {
      contract: 'MockChaiPriceSource',
    })
  ).address;

  const chaiIntegratee = (
    await deployMock(hre, {
      contract: 'MockChaiIntegratee',
      args: [primitives.dai, centralizedRateProvider, 18] as MockChaiIntegrateeArgs,
    })
  ).address;

  const kyberIntegratee = (
    await deployMock(hre, {
      contract: 'MockKyberIntegratee',
      args: [centralizedRateProvider, weth, 0] as MockKyberIntegrateeArgs,
    })
  ).address;

  const paraSwapIntegratee = (
    await deployMock(hre, {
      contract: 'MockParaSwapIntegratee',
      args: [centralizedRateProvider, 0] as MockParaSwapIntegrateeArgs,
    })
  ).address;

  const zeroExIntegratee = (
    await deployMock(hre, {
      contract: 'MockZeroExV2Integratee',
      args: [encodeZeroExV2AssetData(primitives.zrx)] as MockZeroExV2IntegrateeArgs,
    })
  ).address;

  const synthetixPriceSource = (
    await deployMock(hre, {
      contract: 'MockSynthetixPriceSource',
      args: [ethUsdAggregator] as MockSynthetixPriceSourceArgs,
    })
  ).address;

  const synthetixIntegratee = (
    await deployMock(hre, {
      contract: 'MockSynthetixIntegratee',
      args: [5, synthetixPriceSource] as MockSynthetixIntegrateeArgs,
    })
  ).address;

  const maxPerBlockDeviation = 3;

  const kyberIntegrateeInstance = new MockKyberIntegratee(kyberIntegratee, deployer);
  const currentMaxPerBlockDeviationKyber = await kyberIntegrateeInstance.getBlockNumberDeviation();
  if (!currentMaxPerBlockDeviationKyber.eq(maxPerBlockDeviation)) {
    await kyberIntegrateeInstance.setBlockNumberDeviation(maxPerBlockDeviation);
  }

  const uniswapIntegrateeInstance = new MockUniswapV2Integratee(uniswapIntegratee, deployer);
  const currentMaxPerBlockDeviationUniswap = await uniswapIntegrateeInstance.getBlockNumberDeviation();
  if (!currentMaxPerBlockDeviationUniswap.eq(maxPerBlockDeviation)) {
    await uniswapIntegrateeInstance.setBlockNumberDeviation(maxPerBlockDeviation);
  }

  const synthetixPriceSourceInstance = new MockSynthetixPriceSource(synthetixPriceSource, deployer);
  const synthetixIntegrateeInstance = new MockSynthetixIntegratee(synthetixIntegratee, deployer);

  const synthetixSynths = [
    ['sUSD', primitives.susd, ...aggregators.susd],
    ['sDEFI', synths.sdefi, ...aggregators.sdefi],
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

  await saveConfig(hre, {
    weth: weth,
    primitives,
    chainlink: {
      ethusd: ethUsdAggregator,
      aggregators,
    },
    wdgld: {
      wdgld: wdgld,
      ethusd: ethUsdAggregator,
      xauusd: xauUsdAggregator,
    },
    synthetix: {
      snx: synthetixIntegratee,
      susd: primitives.susd,
      synths,
      addressResolver: synthetixIntegratee,
      delegateApprovals: synthetixIntegratee,
      originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
      trackingCode: utils.formatBytes32String('ENZYME'),
    },
    compound: {
      ceth: ceth,
      ctokens,
    },
    chai: {
      dai: primitives.dai,
      chai: chaiIntegratee,
      pot: chaiPriceSource,
    },
    kyber: {
      networkProxy: kyberIntegratee,
    },
    paraswap: {
      augustusSwapper: paraSwapIntegratee,
      tokenTransferProxy: paraSwapIntegratee,
    },
    uniswap: {
      factory: uniswapIntegratee,
      router: uniswapIntegratee,
      pools: Object.entries(uniswapPairs).reduce((carry, [key, value]) => {
        const [, , pair] = value;
        return { ...carry, [key]: pair };
      }, {}),
    },
    zeroex: {
      exchange: zeroExIntegratee,
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

// Only run this deployment step on Kovan.
fn.skip = async (hre) => hre.network.name !== 'kovan';

export default fn;
