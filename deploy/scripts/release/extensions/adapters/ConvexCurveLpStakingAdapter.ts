import type { ConvexCurveLpStakingAdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const convexCurveLpStakingWrapperFactory = await get('ConvexCurveLpStakingWrapperFactory');
  const integrationManager = await get('IntegrationManager');

  await deploy('ConvexCurveLpStakingAdapter', {
    args: [
      integrationManager.address,
      config.curve.addressProvider,
      config.wrappedNativeAsset,
      convexCurveLpStakingWrapperFactory.address,
    ] as ConvexCurveLpStakingAdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'ConvexCurveLpStakingAdapter'];
fn.dependencies = ['Config', 'ConvexCurveLpStakingWrapperFactory', 'IntegrationManager'];

export default fn;
