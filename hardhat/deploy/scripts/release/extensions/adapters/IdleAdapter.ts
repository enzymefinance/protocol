import type { IdleAdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const integrationManager = await get('IntegrationManager');
  const idlePriceFeed = await get('IdlePriceFeed');

  await deploy('IdleAdapter', {
    args: [integrationManager.address, idlePriceFeed.address] as IdleAdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'IdleAdapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'IdlePriceFeed'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
