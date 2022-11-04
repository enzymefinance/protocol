import type { CompoundV3AdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const integrationManager = await get('IntegrationManager');
  const compoundV3CTokenListOwner = await get('CompoundV3CTokenListOwner');
  const addressListRegistry = await get('AddressListRegistry');

  await deploy('CompoundV3Adapter', {
    args: [
      integrationManager.address,
      config.compoundV3.configuratorProxy,
      config.compoundV3.rewards,
      addressListRegistry.address,
      compoundV3CTokenListOwner.linkedData.listId,
      compoundV3CTokenListOwner.address,
    ] as CompoundV3AdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CompoundV3Adapter'];
fn.dependencies = ['AddressListRegistry', 'CompoundV3CTokenListOwner', 'Config', 'IntegrationManager'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
