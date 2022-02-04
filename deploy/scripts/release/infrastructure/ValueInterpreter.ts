import type { ValueInterpreterArgs } from '@enzymefinance/protocol';
import {
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_YEAR_IN_SECONDS,
  ValueInterpreter,
} from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, getOrNull },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  const chainlinkStaleRateThreshold = hre.network.live
    ? ONE_DAY_IN_SECONDS + ONE_HOUR_IN_SECONDS
    : ONE_YEAR_IN_SECONDS * 10;

  const valueInterpreter = await deploy('ValueInterpreter', {
    args: [fundDeployer.address, config.weth, chainlinkStaleRateThreshold] as ValueInterpreterArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (valueInterpreter.newlyDeployed) {
    const valueInterpreterInstance = new ValueInterpreter(valueInterpreter.address, deployer);

    // Add ChainlinkPriceFeedMixin config

    await valueInterpreterInstance.setEthUsdAggregator(config.chainlink.ethusd);

    const primitivesInfo = Object.keys(config.primitives).map((key) => {
      if (!config.chainlink.aggregators[key]) {
        throw new Error(`Missing aggregator for ${key}`);
      }

      const aggregator = config.chainlink.aggregators[key];
      const primitive = config.primitives[key];

      return [primitive, ...aggregator] as const;
    });

    const primitives = primitivesInfo.map(([primitive]) => primitive);
    const aggregators = primitivesInfo.map(([, aggregator]) => aggregator);
    const rateAssets = primitivesInfo.map(([, , rateAsset]) => rateAsset);

    await valueInterpreterInstance.addPrimitives(primitives, aggregators, rateAssets);

    // Add AggregatedDerivativePriceFeedMixin config

    const aavePriceFeed = await getOrNull('AavePriceFeed');
    const curvePriceFeed = await getOrNull('CurvePriceFeed');
    const compoundPriceFeed = await getOrNull('CompoundPriceFeed');
    const fusePriceFeed = await getOrNull('FusePriceFeed');

    const idlePriceFeed = await getOrNull('IdlePriceFeed');
    const lidoStethPriceFeed = await getOrNull('LidoStethPriceFeed');
    const poolTogetherV4PriceFeed = await getOrNull('PoolTogetherV4PriceFeed');
    const yearnVaultV2PriceFeed = await getOrNull('YearnVaultV2PriceFeed');

    const derivativePairs: [string, string][] = [
      ...(compoundPriceFeed ? [[config.compound.ceth, compoundPriceFeed.address] as [string, string]] : []),
      ...(fusePriceFeed
        ? Object.values(config.fuse.fetherTokens).map((fether) => [fether, fusePriceFeed.address] as [string, string])
        : []),
      ...(lidoStethPriceFeed ? [[config.lido.steth, lidoStethPriceFeed.address] as [string, string]] : []),
      ...(aavePriceFeed
        ? Object.values(config.aave.atokens).map(([atoken]) => [atoken, aavePriceFeed.address] as [string, string])
        : []),
      ...(compoundPriceFeed
        ? Object.values(config.compound.ctokens).map(
            (ctoken) => [ctoken, compoundPriceFeed.address] as [string, string],
          )
        : []),
      ...(curvePriceFeed
        ? Object.values(config.curve.pools).map((pool) => [pool.lpToken, curvePriceFeed.address] as [string, string])
        : []),
      ...(curvePriceFeed
        ? Object.values(config.curve.pools).map(
            (pool) => [pool.liquidityGaugeToken, curvePriceFeed.address] as [string, string],
          )
        : []),
      ...(fusePriceFeed
        ? Object.values(config.fuse.ftokens).map((ftoken) => [ftoken, fusePriceFeed.address] as [string, string])
        : []),
      ...(idlePriceFeed
        ? Object.values(config.idle).map((idleToken) => [idleToken, idlePriceFeed.address] as [string, string])
        : []),
      ...(poolTogetherV4PriceFeed
        ? Object.values(config.poolTogetherV4.ptTokens).map(
            ([ptToken]) => [ptToken, poolTogetherV4PriceFeed.address] as [string, string],
          )
        : []),
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
  }
};

fn.tags = ['Release', 'ValueInterpreter'];
fn.dependencies = [
  'Config',
  'FundDeployer',
  // Derivative price feeds
  'AavePriceFeed',
  'AlphaHomoraV1PriceFeed',
  'CurvePriceFeed',
  'CompoundPriceFeed',
  'FusePriceFeed',
  'IdlePriceFeed',
  'LidoStethPriceFeed',
  'PoolTogetherV4PriceFeed',
  'SynthetixPriceFeed',
  'YearnVaultV2PriceFeed',
];

export default fn;
