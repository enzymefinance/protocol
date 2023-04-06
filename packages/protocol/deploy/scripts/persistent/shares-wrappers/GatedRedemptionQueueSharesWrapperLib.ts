import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, deploy },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const globalConfig = await get('GlobalConfigProxy');

  await deploy('GatedRedemptionQueueSharesWrapperLib', {
    args: [globalConfig.address, config.wrappedNativeAsset],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'GatedRedemptionQueueSharesWrapperLib'];
fn.dependencies = ['Config', 'GlobalConfigProxy'];

export default fn;
