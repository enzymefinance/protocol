import type { IntegrationManagerArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const policyManager = await get('PolicyManager');
  const aggregatedDerivativePriceFeed = await get('AggregatedDerivativePriceFeed');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');

  await deploy('IntegrationManager', {
    args: [
      fundDeployer.address,
      policyManager.address,
      aggregatedDerivativePriceFeed.address,
      chainlinkPriceFeed.address,
    ] as IntegrationManagerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'IntegrationManager'];
fn.dependencies = ['FundDeployer', 'PolicyManager', 'AggregatedDerivativePriceFeed', 'ChainlinkPriceFeed'];

export default fn;
