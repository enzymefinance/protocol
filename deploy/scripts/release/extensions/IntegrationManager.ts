import type { IntegrationManagerArgs } from '@enzymefinance/protocol';
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
  const policyManager = await get('PolicyManager');
  const aggregatedDerivativePriceFeed = await get('AggregatedDerivativePriceFeed');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');

  await deploy('IntegrationManager', {
    args: [
      fundDeployer.address,
      policyManager.address,
      aggregatedDerivativePriceFeed.address,
      chainlinkPriceFeed.address,
      synthetixPriceFeed.address,
      config.synthetix.addressResolver,
    ] as IntegrationManagerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'IntegrationManager'];
fn.dependencies = [
  'Config',
  'FundDeployer',
  'PolicyManager',
  'AggregatedDerivativePriceFeed',
  'ChainlinkPriceFeed',
  'SynthetixPriceFeed',
];

export default fn;
