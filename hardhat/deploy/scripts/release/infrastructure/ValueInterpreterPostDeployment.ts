import { ChainlinkRateAsset, ValueInterpreter } from '@enzymefinance/protocol';
import { constants } from 'ethers';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, getOrNull },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const valueInterpreter = await get('ValueInterpreter');
  const valueInterpreterInstance = new ValueInterpreter(valueInterpreter.address, deployer);

  // Add primitives to the asset universe
  const primitives: string[] = [];
  const aggregators: string[] = [];
  const rateAssets: ChainlinkRateAsset[] = [];

  // Standard primitives
  for (const [key, primitive] of Object.entries(config.primitives)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!config.chainlink.aggregators[key]) {
      throw new Error(`Missing aggregator for primitive: ${key}`);
    }

    primitives.push(primitive);
    const aggregatorInfo = config.chainlink.aggregators[key];
    aggregators.push(aggregatorInfo[0]);
    rateAssets.push(aggregatorInfo[1]);
  }

  // Aave v2 aTokens as primitives
  for (const [key, aToken] of Object.entries(config.aaveV2.atokens)) {
    if (!key.startsWith('a')) {
      throw new Error(`Key not formatted as Aave v2 aToken: ${key}`);
    }

    primitives.push(aToken);

    // Remove the "a" from aToken symbol
    const primitiveKey = key.substring(1);

    // Handle exceptions to the rule
    if (primitiveKey === 'weth') {
      aggregators.push(config.chainlink.ethusd);
      rateAssets.push(ChainlinkRateAsset.USD);

      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!config.chainlink.aggregators[primitiveKey]) {
      throw new Error(`Missing aggregator for Aave v2 aToken: ${key}`);
    }

    const aggregatorInfo = config.chainlink.aggregators[primitiveKey];
    aggregators.push(aggregatorInfo[0]);
    rateAssets.push(aggregatorInfo[1]);
  }

  // Aave v3 aTokens as primitives
  for (const [key, aToken] of Object.entries(config.aaveV3.atokens)) {
    if (!key.startsWith('a')) {
      throw new Error(`Key not formatted as Aave v3 aToken: ${key}`);
    }

    primitives.push(aToken);

    // Remove the "a" from aToken symbol
    const primitiveKey = key.substring(1);

    // Handle exceptions to the rule
    if (primitiveKey === 'weth') {
      aggregators.push(config.chainlink.ethusd);
      rateAssets.push(ChainlinkRateAsset.USD);

      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!config.chainlink.aggregators[primitiveKey]) {
      throw new Error(`Missing aggregator for Aave v3 aToken: ${key}`);
    }

    const aggregatorInfo = config.chainlink.aggregators[primitiveKey];
    aggregators.push(aggregatorInfo[0]);
    rateAssets.push(aggregatorInfo[1]);
  }

  // Compound v3 cTokens as primitives
  for (const [key, cToken] of Object.entries(config.compoundV3.ctokens)) {
    if (!key.startsWith('c')) {
      throw new Error(`Key not formatted as Compound v3 cToken: ${key}`);
    }

    primitives.push(cToken);

    // Remove the "c" from cToken symbol
    const primitiveKey = key.substring(1);

    // Handle exceptions to the rule
    if (primitiveKey === 'weth') {
      aggregators.push(config.chainlink.ethusd);
      rateAssets.push(ChainlinkRateAsset.USD);

      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!config.chainlink.aggregators[primitiveKey]) {
      throw new Error(`Missing aggregator for Compound v3 cToken: ${key}`);
    }

    const aggregatorInfo = config.chainlink.aggregators[primitiveKey];
    aggregators.push(aggregatorInfo[0]);
    rateAssets.push(aggregatorInfo[1]);
  }

  // Add all primitives to asset universe
  await valueInterpreterInstance.addPrimitives(primitives, aggregators, rateAssets);

  // Add derivatives to the asset universe
  const curvePriceFeed = await getOrNull('CurvePriceFeed');
  const compoundPriceFeed = await getOrNull('CompoundPriceFeed');
  const fiduPriceFeed = await getOrNull('FiduPriceFeed');
  const idlePriceFeed = await getOrNull('IdlePriceFeed');
  const poolTogetherV4PriceFeed = await getOrNull('PoolTogetherV4PriceFeed');
  const wstethPriceFeed = await getOrNull('WstethPriceFeed');
  const yearnVaultV2PriceFeed = await getOrNull('YearnVaultV2PriceFeed');

  const derivativePairs: [string, string][] = [
    ...(compoundPriceFeed ? [[config.compoundV2.ceth, compoundPriceFeed.address] as [string, string]] : []),
    ...(fiduPriceFeed ? [[config.goldfinch.fidu, fiduPriceFeed.address] as [string, string]] : []),
    ...(compoundPriceFeed
      ? Object.values(config.compoundV2.ctokens).map(
          (ctoken) => [ctoken, compoundPriceFeed.address] as [string, string],
        )
      : []),
    ...(curvePriceFeed
      ? Object.values(config.curve.pools).map((pool) => [pool.lpToken, curvePriceFeed.address] as [string, string])
      : []),
    // Filters out pools with no gauge token
    ...(curvePriceFeed
      ? Object.values(config.curve.pools)
          .filter((pool) => pool.liquidityGaugeToken !== constants.AddressZero)
          .map((pool) => [pool.liquidityGaugeToken, curvePriceFeed.address] as [string, string])
      : []),
    ...(idlePriceFeed
      ? Object.values(config.idle).map((idleToken) => [idleToken, idlePriceFeed.address] as [string, string])
      : []),
    ...(poolTogetherV4PriceFeed
      ? Object.values(config.poolTogetherV4.ptTokens).map(
          ([ptToken]) => [ptToken, poolTogetherV4PriceFeed.address] as [string, string],
        )
      : []),
    ...(wstethPriceFeed ? [[config.lido.wsteth, wstethPriceFeed.address] as [string, string]] : []),
    ...(yearnVaultV2PriceFeed
      ? Object.values(config.yearn.vaultV2.yVaults).map(
          (yVault) => [yVault, yearnVaultV2PriceFeed.address] as [string, string],
        )
      : []),
  ];

  const derivatives = derivativePairs.map(([derivative]) => derivative);
  const derivativeFeeds = derivativePairs.map(([, feed]) => feed);

  if (derivatives.length && derivativeFeeds.length) {
    await valueInterpreterInstance.addDerivatives(derivatives, derivativeFeeds);
  }
};

fn.tags = ['Release'];
fn.dependencies = [
  'Config',
  'ValueInterpreter',
  'CurvePriceFeed',
  'CompoundPriceFeed',
  'FiduPriceFeed',
  'IdlePriceFeed',
  'PoolTogetherV4PriceFeed',
  'WstethPriceFeed',
  'YearnVaultV2PriceFeed',
];

fn.skip = async (hre) => hre.network.live;

export default fn;
