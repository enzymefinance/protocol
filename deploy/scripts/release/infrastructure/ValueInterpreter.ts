import {
  ValueInterpreterArgs,
  ValueInterpreter,
  ONE_YEAR_IN_SECONDS,
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
} from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';
import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
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

    const aavePriceFeed = await get('AavePriceFeed');
    const curvePriceFeed = await get('CurvePriceFeed');
    const compoundPriceFeed = await get('CompoundPriceFeed');
    const idlePriceFeed = await get('IdlePriceFeed');
    const lidoStethPriceFeed = await get('LidoStethPriceFeed');
    const poolTogetherV4PriceFeed = await get('PoolTogetherV4PriceFeed');
    const stakehoundEthPriceFeed = await get('StakehoundEthPriceFeed');
    const synthetixPriceFeed = await get('SynthetixPriceFeed');
    const yearnVaultV2PriceFeed = await get('YearnVaultV2PriceFeed');

    const derivativePairs: [string, string][] = [
      [config.compound.ceth, compoundPriceFeed.address],
      [config.lido.steth, lidoStethPriceFeed.address],
      [config.stakehound.steth, stakehoundEthPriceFeed.address],
      ...Object.values(config.aave.atokens).map(([atoken]) => [atoken, aavePriceFeed.address] as [string, string]),
      ...Object.values(config.compound.ctokens).map(
        (ctoken) => [ctoken, compoundPriceFeed.address] as [string, string],
      ),
      ...Object.values(config.curve.pools).map((pool) => [pool.lpToken, curvePriceFeed.address] as [string, string]),
      ...Object.values(config.curve.pools).map(
        (pool) => [pool.liquidityGaugeToken, curvePriceFeed.address] as [string, string],
      ),
      ...Object.values(config.idle).map((idleToken) => [idleToken, idlePriceFeed.address] as [string, string]),
      ...Object.values(config.poolTogetherV4.ptTokens).map(
        ([ptToken]) => [ptToken, poolTogetherV4PriceFeed.address] as [string, string],
      ),
      ...Object.values(config.synthetix.synths).map((synth) => [synth, synthetixPriceFeed.address] as [string, string]),
      ...Object.values(config.yearn.vaultV2.yVaults).map(
        (yVault) => [yVault, yearnVaultV2PriceFeed.address] as [string, string],
      ),
    ];

    const derivatives = derivativePairs.map(([derivative]) => derivative);
    const derivativeFeeds = derivativePairs.map(([, feed]) => feed);

    await valueInterpreterInstance.addDerivatives(derivatives, derivativeFeeds);
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
  'IdlePriceFeed',
  'LidoStethPriceFeed',
  'PoolTogetherV4PriceFeed',
  'StakehoundEthPriceFeed',
  'SynthetixPriceFeed',
  'YearnVaultV2PriceFeed',
];

export default fn;
