import type { PoolTogetherV4AdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const integrationManager = await get('IntegrationManager');
  const poolTogetherV4PriceFeed = await get('PoolTogetherV4PriceFeed');

  await deploy('PoolTogetherV4Adapter', {
    args: [integrationManager.address, poolTogetherV4PriceFeed.address] as PoolTogetherV4AdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'PoolTogetherV4Adapter'];
fn.dependencies = ['IntegrationManager', 'PoolTogetherV4PriceFeed'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
