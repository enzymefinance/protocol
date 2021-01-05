import { DeployFunction } from 'hardhat-deploy/types';
import type { IntegrationManagerArgs } from '@melonproject/protocol';
import { loadConfig } from './Config';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const config = await loadConfig(hre);

  const fundDeployer = await get('FundDeployer');
  const policyManager = await get('PolicyManager');
  const aggregatedDerivativePriceFeed = await get('AggregatedDerivativePriceFeed');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');

  await deploy('IntegrationManager', {
    from: deployer.address,
    log: true,
    args: [
      fundDeployer.address,
      policyManager.address,
      aggregatedDerivativePriceFeed.address,
      chainlinkPriceFeed.address,
      synthetixPriceFeed.address,
      config.synthetix.addressResolver,
    ] as IntegrationManagerArgs,
  });
};

fn.tags = ['Release', 'IntegrationManager'];
fn.dependencies = ['Config', 'FundDeployer', 'PolicyManager', 'Prices'];

export default fn;
