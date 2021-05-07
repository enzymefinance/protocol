import { AggregatedDerivativePriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, getOrNull },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');
  const aavePriceFeed = await getOrNull('AavePriceFeed');
  const alphaHomoraV1PriceFeed = await getOrNull('AlphaHomoraV1PriceFeed');
  const curvePriceFeed = await getOrNull('CurvePriceFeed');
  const compoundPriceFeed = await getOrNull('CompoundPriceFeed');
  const idlePriceFeed = await getOrNull('IdlePriceFeed');
  const lidoStethPriceFeed = await getOrNull('LidoStethPriceFeed');
  const stakehoundEthPriceFeed = await getOrNull('StakehoundEthPriceFeed');
  const synthetixPriceFeed = await getOrNull('SynthetixPriceFeed');
  const wdgldPriceFeed = await getOrNull('WdgldPriceFeed');

  const derivativePairs: [string, string][] = [];
  if (alphaHomoraV1PriceFeed != null) {
    derivativePairs.push([config.alphaHomoraV1.ibeth, alphaHomoraV1PriceFeed.address]);
  }

  if (wdgldPriceFeed != null) {
    derivativePairs.push([config.wdgld.wdgld, wdgldPriceFeed.address]);
  }

  if (compoundPriceFeed != null) {
    derivativePairs.push([config.compound.ceth, compoundPriceFeed.address]);
  }

  if (lidoStethPriceFeed != null) {
    derivativePairs.push([config.lido.steth, lidoStethPriceFeed.address]);
  }

  if (stakehoundEthPriceFeed != null) {
    derivativePairs.push([config.stakehound.steth, stakehoundEthPriceFeed.address]);
  }

  if (aavePriceFeed != null) {
    derivativePairs.push(
      ...Object.values(config.aave.atokens).map(([atoken]) => [atoken, aavePriceFeed.address] as [string, string]),
    );
  }

  if (compoundPriceFeed != null) {
    derivativePairs.push(
      ...Object.values(config.compound.ctokens).map(
        (ctoken) => [ctoken, compoundPriceFeed.address] as [string, string],
      ),
    );
  }

  if (curvePriceFeed != null) {
    derivativePairs.push(
      ...Object.values(config.curve.pools).map((pool) => [pool.lpToken, curvePriceFeed.address] as [string, string]),
    );
    derivativePairs.push(
      ...Object.values(config.curve.pools).map(
        (pool) => [pool.liquidityGaugeToken, curvePriceFeed.address] as [string, string],
      ),
    );
  }

  if (idlePriceFeed != null) {
    derivativePairs.push(
      ...Object.values(config.idle).map((idleToken) => [idleToken, idlePriceFeed.address] as [string, string]),
    );
  }

  if (synthetixPriceFeed != null) {
    derivativePairs.push(
      ...Object.values(config.synthetix.synths).map((synth) => [synth, synthetixPriceFeed.address] as [string, string]),
    );
  }

  const derivatives = derivativePairs.map(([derivative]) => derivative);
  const feeds = derivativePairs.map(([, feed]) => feed);

  await deploy('AggregatedDerivativePriceFeed', {
    args: [fundDeployer.address, derivatives, feeds] as AggregatedDerivativePriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'AggregatedDerivativePriceFeed'];
fn.dependencies = [
  'Config',
  'FundDeployer',
  'AavePriceFeed',
  'AlphaHomoraV1PriceFeed',
  'CurvePriceFeed',
  'CompoundPriceFeed',
  'IdlePriceFeed',
  'LidoStethPriceFeed',
  'StakehoundEthPriceFeed',
  'SynthetixPriceFeed',
  'WdgldPriceFeed',
];

export default fn;
