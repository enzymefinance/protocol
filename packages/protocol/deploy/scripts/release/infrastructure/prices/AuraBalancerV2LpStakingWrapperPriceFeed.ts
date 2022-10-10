import type { AuraBalancerV2LpStakingWrapperPriceFeedArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const auraBalancerV2LpStakingWrapperFactory = await get('AuraBalancerV2LpStakingWrapperFactory');

  await deploy('AuraBalancerV2LpStakingWrapperPriceFeed', {
    args: [auraBalancerV2LpStakingWrapperFactory.address] as AuraBalancerV2LpStakingWrapperPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'AuraBalancerV2LpStakingWrapperPriceFeed'];
fn.dependencies = ['AuraBalancerV2LpStakingWrapperFactory'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
