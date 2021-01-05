import path from 'path';
import fs from 'fs-extra';
import { utils, constants } from 'ethers';
import { DeployFunction, DeployOptions, DeployResult } from 'hardhat-deploy/types';
import {
  encodeZeroExV2AssetData,
  CentralizedRateProviderArgs,
  MockCTokenIntegrateeArgs,
  MockChainlinkPriceSourceArgs,
  MockChaiIntegrateeArgs,
  MockKyberIntegrateeArgs,
  MockParaSwapIntegrateeArgs,
  MockZeroExV2IntegrateeArgs,
  MockSynthetixTokenArgs,
  MockSynthetixPriceSourceArgs,
  MockSynthetixIntegrateeArgs,
  MockTokenArgs,
  MockSynthetixIntegratee,
  MockUniswapV2PriceSourceArgs,
  MockUniswapV2IntegrateeArgs,
  ChainlinkRateAsset,
} from '@melonproject/protocol';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeploymentConfig } from './Config';

// TODO: We might want to set the initial rates of our mock aggregators already in the
// deployment script. Currently, however, these addresses are unused.
const mainnetAggregators = {
  ANT: ['0x8f83670260F8f7708143b836a2a6F11eF0aBac01', ChainlinkRateAsset.ETH],
  BAL: ['0xC1438AA3823A6Ba0C159CfA8D98dF5A994bA120b', ChainlinkRateAsset.ETH],
  BAT: ['0x0d16d4528239e9ee52fa531af613AcdB23D88c94', ChainlinkRateAsset.ETH],
  BNB: ['0x14e613AC84a31f709eadbdF89C6CC390fDc9540A', ChainlinkRateAsset.USD],
  BNT: ['0xCf61d1841B178fe82C8895fe60c2EDDa08314416', ChainlinkRateAsset.ETH],
  BUSD: ['0x614715d2Af89E6EC99A233818275142cE88d1Cfd', ChainlinkRateAsset.ETH],
  BZRX: ['0x8f7C7181Ed1a2BA41cfC3f5d064eF91b67daef66', ChainlinkRateAsset.ETH],
  COMP: ['0x1B39Ee86Ec5979ba5C322b826B3ECb8C79991699', ChainlinkRateAsset.ETH],
  DAI: ['0x773616E4d11A78F511299002da57A0a94577F1f4', ChainlinkRateAsset.ETH],
  SNX: ['0x79291A9d692Df95334B1a0B3B4AE6bC606782f8c', ChainlinkRateAsset.ETH],
  ENJ: ['0xfaDbe2ee798889F02d1d39eDaD98Eff4c7fe95D4', ChainlinkRateAsset.ETH],
  KNC: ['0x656c0544eF4C98A6a98491833A89204Abb045d6b', ChainlinkRateAsset.ETH],
  LINK: ['0xDC530D9457755926550b59e8ECcdaE7624181557', ChainlinkRateAsset.ETH],
  MANA: ['0x82A44D92D6c329826dc557c5E1Be6ebeC5D5FeB9', ChainlinkRateAsset.ETH],
  MKR: ['0x24551a8Fb2A7211A25a17B1481f043A8a8adC7f2', ChainlinkRateAsset.ETH],
  MLN: ['0xDaeA8386611A157B08829ED4997A8A62B557014C', ChainlinkRateAsset.ETH],
  NMR: ['0x9cB2A01A7E64992d32A34db7cEea4c919C391f6A', ChainlinkRateAsset.ETH],
  REN: ['0x3147D7203354Dc06D9fd350c7a2437bcA92387a4', ChainlinkRateAsset.ETH],
  REP: ['0xD4CE430C3b67b3E2F7026D86E7128588629e2455', ChainlinkRateAsset.ETH],
  RLC: ['0x4cba1e1fdc738D0fe8DB3ee07728E2Bc4DA676c6', ChainlinkRateAsset.ETH],
  UMA: ['0xf817B69EA583CAFF291E287CaE00Ea329d22765C', ChainlinkRateAsset.ETH],
  UNI: ['0xD6aA3D25116d8dA79Ea0246c4826EB951872e02e', ChainlinkRateAsset.ETH],
  USDC: ['0x986b5E1e1755e3C2440e960477f25201B0a8bbD4', ChainlinkRateAsset.ETH],
  USDT: ['0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46', ChainlinkRateAsset.ETH],
  WBTC: ['0xdeb288F737066589598e9214E782fa5A8eD689e8', ChainlinkRateAsset.ETH],
  wNXM: ['0xe5Dc0A609Ab8bCF15d3f35cFaa1Ff40f521173Ea', ChainlinkRateAsset.ETH],
  YFI: ['0x7c5d4F8345e66f68099581Db340cd65B078C41f4', ChainlinkRateAsset.ETH],
  ZRX: ['0x2Da4983a622a8498bb1a21FaE9D8F6C664939962', ChainlinkRateAsset.ETH],
  sUSD: ['0xb343e7a1aF578FA35632435243D814e7497622f7', ChainlinkRateAsset.ETH],
} as const;

function chainlinkRateAsset(asset: keyof typeof mainnetAggregators): ChainlinkRateAsset {
  const [, rateAsset] = mainnetAggregators[asset];
  return rateAsset;
}

interface DeployMockOptions extends Omit<DeployOptions, 'from'> {
  name?: string;
  from?: string;
  contract: string;
}

async function deployMock(
  hre: HardhatRuntimeEnvironment,
  { contract, name, from, ...options }: DeployMockOptions,
): Promise<DeployResult> {
  const mockName = `mocks/${contract}${name ? ` (${name})` : ''}`;
  const existingMock = await hre.deployments.getOrNull(mockName);
  if (!!existingMock) {
    hre.deployments.log(`reusing "${mockName}" at ${existingMock.address}`);
    return Object.assign(existingMock, { newlyDeployed: false });
  }

  const root = hre.config.paths.deployments;
  const network = hre.network.name;
  await fs.ensureDir(path.join(root, network, path.dirname(mockName)));

  return await hre.deployments.deploy(mockName, {
    log: true,
    contract,
    from: from ?? (await hre.getNamedAccounts()).deployer,
    ...options,
  });
}

function createDeployMockToken(hre: HardhatRuntimeEnvironment) {
  return async function (symbol: string, name: string, decimals: number) {
    return await deployMock(hre, {
      name: symbol,
      contract: 'MockToken',
      args: [name, symbol, decimals] as MockTokenArgs,
    });
  };
}

function createDeployMockSynthetixToken(hre: HardhatRuntimeEnvironment) {
  return async function (symbol: string, name: string, decimals: number) {
    const currency = utils.formatBytes32String(symbol);

    return await deployMock(hre, {
      name: symbol,
      contract: 'MockSynthetixToken',
      args: [name, symbol, decimals, currency] as MockSynthetixTokenArgs,
    });
  };
}

function createDeployMockCompoundToken(hre: HardhatRuntimeEnvironment, centralizedRateProvider: string) {
  return async function (symbol: string, name: string, decimals: number, primitive: string, rate: number) {
    const normalizedRate = utils.parseEther(`${rate}`);

    return await deployMock(hre, {
      name: symbol,
      contract: 'MockCTokenIntegratee',
      args: [name, symbol, decimals, primitive, centralizedRateProvider, normalizedRate] as MockCTokenIntegrateeArgs,
    });
  };
}

function createDeployMockAggregator(hre: HardhatRuntimeEnvironment) {
  return async function (symbol: keyof typeof mainnetAggregators) {
    const decimals = chainlinkRateAsset(symbol) === ChainlinkRateAsset.ETH ? 18 : 8;
    const deployment = await deployMock(hre, {
      name: symbol,
      contract: 'MockChainlinkPriceSource',
      args: [decimals] as MockChainlinkPriceSourceArgs,
    });

    return deployment;
  };
}

function createDeployMockUniswapPair(hre: HardhatRuntimeEnvironment) {
  return async function (name: string, a: string, b: string) {
    return await deployMock(hre, {
      name,
      contract: 'MockUniswapV2PriceSource',
      args: [a, b] as MockUniswapV2PriceSourceArgs,
    });
  };
}

async function saveMockDeployment(hre: HardhatRuntimeEnvironment, data: DeploymentConfig) {
  await hre.deployments.save('Mocks', {
    abi: [],
    address: constants.AddressZero,
    linkedData: data,
  });
}

export async function loadMockDeployment(hre: HardhatRuntimeEnvironment): Promise<DeploymentConfig> {
  const deployment = await hre.deployments.get('Mocks');
  return deployment.linkedData;
}

const fn: DeployFunction = async function (hre) {
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const centralizedRateProvider = await deployMock(hre, {
    contract: 'CentralizedRateProvider',
    args: [5] as CentralizedRateProviderArgs,
  });

  const deployMockToken = createDeployMockToken(hre);
  const deployMockSynthetixToken = createDeployMockSynthetixToken(hre);
  const deployMockCompoundToken = createDeployMockCompoundToken(hre, centralizedRateProvider.address);
  const deployMockAggregator = createDeployMockAggregator(hre);
  const deployMockUniswapPair = createDeployMockUniswapPair(hre);
  const deployMockTokenAndAggregator = async (
    symbol: keyof typeof mainnetAggregators,
    name: string,
    decimals: number,
  ) => {
    const token = await deployMockToken(symbol, name, decimals);
    const aggregator = await deployMockAggregator(symbol);
    return [token, aggregator];
  };

  // WETH
  const weth = await deployMockToken('WETH', 'Wrapped Ether', 18);

  // PRIMITIVES
  const [ant, antAggregator] = await deployMockTokenAndAggregator('ANT', 'Aragon Network Token', 18);
  const [bal, balAggregator] = await deployMockTokenAndAggregator('BAL', 'Balancer', 18);
  const [bat, batAggregator] = await deployMockTokenAndAggregator('BAT', 'Basic Attention Token', 18);
  const [bnb, bnbAggregator] = await deployMockTokenAndAggregator('BNB', 'BNB', 18);
  const [bnt, bntAggregator] = await deployMockTokenAndAggregator('BNT', 'Bancor Network Token', 18);
  const [busd, busdAggregator] = await deployMockTokenAndAggregator('BUSD', 'Binance USD', 18);
  const [bzrx, bzrxAggregator] = await deployMockTokenAndAggregator('BZRX', 'bZx Protocol Token', 18);
  const [comp, compAggregator] = await deployMockTokenAndAggregator('COMP', 'Compound', 18);
  const [dai, daiAggregator] = await deployMockTokenAndAggregator('DAI', 'Dai Stablecoin', 18);
  const [snx, snxAggregator] = await deployMockTokenAndAggregator('SNX', 'Synthetix Network Token', 18);
  const [enj, enjAggregator] = await deployMockTokenAndAggregator('ENJ', 'Enjin Coin', 18);
  const [knc, kncAggregator] = await deployMockTokenAndAggregator('KNC', 'Kyber Network Crystal', 18);
  const [link, linkAggregator] = await deployMockTokenAndAggregator('LINK', 'ChainLink Token', 18);
  const [mana, manaAggregator] = await deployMockTokenAndAggregator('MANA', 'Decentraland MANA', 18);
  const [mkr, mkrAggregator] = await deployMockTokenAndAggregator('MKR', 'Maker', 18);
  const [mln, mlnAggregator] = await deployMockTokenAndAggregator('MLN', 'Melon Token', 18);
  const [nmr, nmrAggregator] = await deployMockTokenAndAggregator('NMR', 'Numeraire', 18);
  const [ren, renAggregator] = await deployMockTokenAndAggregator('REN', 'Republic Token', 18);
  const [rep, repAggregator] = await deployMockTokenAndAggregator('REP', 'Reputation', 18);
  const [rlc, rlcAggregator] = await deployMockTokenAndAggregator('RLC', 'iEx.ec Network Token', 9);
  const [uma, umaAggregator] = await deployMockTokenAndAggregator('UMA', 'UMA Voting Token v1', 18);
  const [uni, uniAggregator] = await deployMockTokenAndAggregator('UNI', 'Uniswap', 18);
  const [usdc, usdcAggregator] = await deployMockTokenAndAggregator('USDC', 'USD Coin', 6);
  const [usdt, usdtAggregator] = await deployMockTokenAndAggregator('USDT', 'Tether USD', 6);
  const [wbtc, wbtcAggregator] = await deployMockTokenAndAggregator('WBTC', 'Wrapped BTC', 8);
  const [wnxm, wnxmAggregator] = await deployMockTokenAndAggregator('wNXM', 'Wrapped NXM', 18);
  const [yfi, yfiAggregator] = await deployMockTokenAndAggregator('YFI', 'yearn.finance', 18);
  const [zrx, zrxAggregator] = await deployMockTokenAndAggregator('ZRX', '0x Protocol Token', 18);

  // WDGLD
  const wdgld = await deployMockToken('wDGLD', 'wrapped-DGLD', 8);

  // SYNTHETIX
  const soil = await deployMockSynthetixToken('sOIL', 'Synth sOIL', 18);
  const sdefi = await deployMockSynthetixToken('sDEFI', 'Synth sDEFI', 18);
  const susd = await deployMockSynthetixToken('sUSD', 'Synth sUSD', 18);
  const susdAggregator = await deployMockAggregator('sUSD');

  // COMPOUND
  // TODO: cETH should be its own mock contract type (currently uses MockCTokenIntegratee).
  const ceth = await deployMockCompoundToken('cETH', 'Compound Ether', 8, weth.address, 1);
  const cbat = await deployMockCompoundToken('cBAT', 'Compound Basic Attention Token', 18, bat.address, 1);
  const ccomp = await deployMockCompoundToken('cCOMP', 'Compound Collateral', 8, comp.address, 1);
  const cdai = await deployMockCompoundToken('cDAI', 'Compound Dai', 8, dai.address, 1);
  const crep = await deployMockCompoundToken('cREP', 'Compound Augur', 8, rep.address, 1);
  const cuni = await deployMockCompoundToken('cUNI', 'Compound Uniswap', 8, uni.address, 1);
  const cusdc = await deployMockCompoundToken('cUSDC', 'Compound USD Coin', 8, usdc.address, 1);
  const cusdt = await deployMockCompoundToken('cUSDT', 'Compound USDT', 8, usdt.address, 1);
  const cwbtc = await deployMockCompoundToken('cWBTC', 'Compound Wrapped BTC', 8, wbtc.address, 1);
  const czrx = await deployMockCompoundToken('cZRX', 'Compound 0x', 8, zrx.address, 1);

  // UNISWAP PAIRS
  const uniswapPairs = [
    [ant, weth, await deployMockUniswapPair('ANT-WETH', ant.address, weth.address)],
    [bal, weth, await deployMockUniswapPair('BAL-WETH', bal.address, weth.address)],
    [bat, weth, await deployMockUniswapPair('BAT-WETH', bat.address, weth.address)],
    [busd, usdc, await deployMockUniswapPair('BUSD-USDC', busd.address, usdc.address)],
    [bzrx, weth, await deployMockUniswapPair('BZRX-WETH', bzrx.address, weth.address)],
    [comp, weth, await deployMockUniswapPair('COMP-WETH', comp.address, weth.address)],
    [dai, usdc, await deployMockUniswapPair('DAI-USDC', dai.address, usdc.address)],
    [dai, usdt, await deployMockUniswapPair('DAI-USDT', dai.address, usdt.address)],
    [dai, weth, await deployMockUniswapPair('DAI-WETH', dai.address, weth.address)],
    [link, weth, await deployMockUniswapPair('LINK-WETH', link.address, weth.address)],
    [mana, weth, await deployMockUniswapPair('MANA-WETH', mana.address, weth.address)],
    [mkr, weth, await deployMockUniswapPair('MKR-WETH', mkr.address, weth.address)],
    [nmr, weth, await deployMockUniswapPair('NMR-WETH', nmr.address, weth.address)],
    [ren, weth, await deployMockUniswapPair('REN-WETH', ren.address, weth.address)],
    [rlc, weth, await deployMockUniswapPair('RLC-WETH', rlc.address, weth.address)],
    [snx, weth, await deployMockUniswapPair('SNX-WETH', snx.address, weth.address)],
    [uma, weth, await deployMockUniswapPair('UMA-WETH', uma.address, weth.address)],
    [uni, weth, await deployMockUniswapPair('UNI-WETH', uni.address, weth.address)],
    [usdc, usdt, await deployMockUniswapPair('USDC-USDT', usdc.address, usdt.address)],
    [usdc, weth, await deployMockUniswapPair('USDC-WETH', usdc.address, weth.address)],
    [wbtc, usdc, await deployMockUniswapPair('WBTC-USDC', wbtc.address, usdc.address)],
    [wbtc, usdt, await deployMockUniswapPair('WBTC-USDT', wbtc.address, usdt.address)],
    [wbtc, weth, await deployMockUniswapPair('WBTC-WETH', wbtc.address, weth.address)],
    [weth, enj, await deployMockUniswapPair('WETH-ENJ', weth.address, enj.address)],
    [weth, knc, await deployMockUniswapPair('WETH-KNC', weth.address, knc.address)],
    [weth, mln, await deployMockUniswapPair('WETH-MLN', weth.address, mln.address)],
    [weth, usdt, await deployMockUniswapPair('WETH-USDT', weth.address, usdt.address)],
    [weth, zrx, await deployMockUniswapPair('WETH-ZRX', weth.address, zrx.address)],
    [wnxm, weth, await deployMockUniswapPair('wNXM-WETH', wnxm.address, weth.address)],
    [yfi, weth, await deployMockUniswapPair('YFI-WETH', yfi.address, weth.address)],
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

  const ethUsdAggregator = await deployMock(hre, {
    contract: 'MockChainlinkPriceSource',
    name: 'ETH-USD',
    args: [8] as MockChainlinkPriceSourceArgs,
  });

  const xauUsdAggregator = await deployMock(hre, {
    contract: 'MockChainlinkPriceSource',
    name: 'XAU-USD',
    args: [8] as MockChainlinkPriceSourceArgs,
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

  // TODO: In the current testnet mock deployment, we use chainlink aggregators
  // for updating the prices of synthetix assets. Maybe it would be better to directly
  // set the price on the MockSynthetixPriceSource (setRate) instead. The extra
  // step via the aggregator seems unecessary.
  const synthetixPriceSource = await deployMock(hre, {
    contract: 'MockSynthetixPriceSource',
    args: [ethUsdAggregator.address] as MockSynthetixPriceSourceArgs,
  });

  const synthetixIntegratee = await deployMock(hre, {
    contract: 'MockSynthetixIntegratee',
    args: [5, synthetixPriceSource.address] as MockSynthetixIntegrateeArgs,
  });

  const synthetixIntegrateeInstance = new MockSynthetixIntegratee(synthetixIntegratee.address, deployer);
  const synthetixSynths = [
    ['sUSD', susd],
    ['sOIL', soil.address],
    ['sDEFI', sdefi.address],
  ] as const;

  await synthetixIntegrateeInstance.setSynthFromCurrencyKeys(
    synthetixSynths.map(([symbol]) => utils.formatBytes32String(symbol)),
    synthetixSynths.map(([, address]) => address),
  );

  await saveMockDeployment(hre, {
    weth: weth.address,
    chainlink: {
      ethusd: ethUsdAggregator.address,
      primitives: [
        [ant.address, antAggregator.address, chainlinkRateAsset('ANT')],
        [bal.address, balAggregator.address, chainlinkRateAsset('BAL')],
        [bat.address, batAggregator.address, chainlinkRateAsset('BAT')],
        [bnb.address, bnbAggregator.address, chainlinkRateAsset('BNB')],
        [bnt.address, bntAggregator.address, chainlinkRateAsset('BNT')],
        [busd.address, busdAggregator.address, chainlinkRateAsset('BUSD')],
        [bzrx.address, bzrxAggregator.address, chainlinkRateAsset('BZRX')],
        [comp.address, compAggregator.address, chainlinkRateAsset('COMP')],
        [dai.address, daiAggregator.address, chainlinkRateAsset('DAI')],
        [snx.address, snxAggregator.address, chainlinkRateAsset('SNX')],
        [enj.address, enjAggregator.address, chainlinkRateAsset('ENJ')],
        [knc.address, kncAggregator.address, chainlinkRateAsset('KNC')],
        [link.address, linkAggregator.address, chainlinkRateAsset('LINK')],
        [mana.address, manaAggregator.address, chainlinkRateAsset('MANA')],
        [mkr.address, mkrAggregator.address, chainlinkRateAsset('MKR')],
        [mln.address, mlnAggregator.address, chainlinkRateAsset('MLN')],
        [nmr.address, nmrAggregator.address, chainlinkRateAsset('NMR')],
        [ren.address, renAggregator.address, chainlinkRateAsset('REN')],
        [rep.address, repAggregator.address, chainlinkRateAsset('REP')],
        [rlc.address, rlcAggregator.address, chainlinkRateAsset('RLC')],
        [uma.address, umaAggregator.address, chainlinkRateAsset('UMA')],
        [uni.address, uniAggregator.address, chainlinkRateAsset('UNI')],
        [usdc.address, usdcAggregator.address, chainlinkRateAsset('USDC')],
        [usdt.address, usdtAggregator.address, chainlinkRateAsset('USDT')],
        [wbtc.address, wbtcAggregator.address, chainlinkRateAsset('WBTC')],
        [wnxm.address, wnxmAggregator.address, chainlinkRateAsset('wNXM')],
        [yfi.address, yfiAggregator.address, chainlinkRateAsset('YFI')],
        [zrx.address, zrxAggregator.address, chainlinkRateAsset('ZRX')],
        [susd.address, susdAggregator.address, chainlinkRateAsset('sUSD')],
      ],
    },
    wdgld: {
      wdgld: wdgld.address,
      ethusd: ethUsdAggregator.address,
      xauusd: xauUsdAggregator.address,
    },
    synthetix: {
      snx: snx.address,
      susd: susd.address,
      synths: [soil.address, sdefi.address],
      addressResolver: synthetixIntegratee.address,
      delegateApprovals: synthetixIntegratee.address,
      originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
      trackingCode: utils.formatBytes32String('ENZYME'),
    },
    compound: {
      ceth: ceth.address,
      ctokens: [
        cbat.address,
        ccomp.address,
        cdai.address,
        crep.address,
        cuni.address,
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

fn.tags = ['Mocks'];

// Skip mock deployments on the mainnet deployment.
fn.skip = async (hre) => hre.network.name === 'mainnet';

export default fn;
