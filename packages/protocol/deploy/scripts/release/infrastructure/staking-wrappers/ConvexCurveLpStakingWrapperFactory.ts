import type { ConvexCurveLpStakingWrapperFactoryArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');

  await deploy('ConvexCurveLpStakingWrapperFactory', {
    args: [
      dispatcher.address,
      config.convex.booster,
      config.convex.crvToken,
      config.convex.cvxToken,
    ] as ConvexCurveLpStakingWrapperFactoryArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ConvexCurveLpStakingWrapperFactory'];
fn.dependencies = ['Config', 'Dispatcher'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
