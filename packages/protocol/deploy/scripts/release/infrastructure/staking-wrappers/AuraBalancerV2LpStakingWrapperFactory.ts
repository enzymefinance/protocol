import type { AuraBalancerV2LpStakingWrapperFactoryArgs } from '@enzymefinance/protocol';
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

  await deploy('AuraBalancerV2LpStakingWrapperFactory', {
    args: [
      dispatcher.address,
      config.aura.booster,
      config.balancer.balToken,
      config.aura.auraToken,
    ] as AuraBalancerV2LpStakingWrapperFactoryArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'AuraBalancerV2LpStakingWrapperFactory'];
fn.dependencies = ['Config', 'Dispatcher'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
