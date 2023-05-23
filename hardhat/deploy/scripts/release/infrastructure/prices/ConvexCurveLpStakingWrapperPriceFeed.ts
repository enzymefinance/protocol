import type { ConvexCurveLpStakingWrapperPriceFeedArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const convexCurveLpStakingWrapperFactory = await get('ConvexCurveLpStakingWrapperFactory');

  await deploy('ConvexCurveLpStakingWrapperPriceFeed', {
    args: [convexCurveLpStakingWrapperFactory.address] as ConvexCurveLpStakingWrapperPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ConvexCurveLpStakingWrapperPriceFeed'];
fn.dependencies = ['ConvexCurveLpStakingWrapperFactory'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
