import type { AuraBalancerV2LpStakingAdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  const auraBalancerV2LpStakingWrapperFactory = await get('AuraBalancerV2LpStakingWrapperFactory');
  const integrationManager = await get('IntegrationManager');

  await deploy('AuraBalancerV2LpStakingAdapter', {
    args: [
      integrationManager.address,
      config.balancer.vault,
      auraBalancerV2LpStakingWrapperFactory.address,
    ] as AuraBalancerV2LpStakingAdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'AuraBalancerV2LpStakingAdapter'];
fn.dependencies = ['AuraBalancerV2LpStakingWrapperFactory', 'Config', 'IntegrationManager'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
