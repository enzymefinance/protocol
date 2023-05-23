import type { DeployFunction } from 'hardhat-deploy/types';

import type { ZeroExV4AdapterArgs } from '../../../../../contracts';
import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const integrationManager = await get('IntegrationManager');
  const addressListRegistry = await get('AddressListRegistry');

  // The listId can be set differently for each ZeroExV4Adapter deployment.
  // ListId of 0 is treated as a special case that allows any maker
  const allowedMakersListId = 0;

  await deploy('ZeroExV4Adapter', {
    args: [
      integrationManager.address,
      config.zeroexV4.exchange,
      addressListRegistry.address,
      allowedMakersListId,
    ] as ZeroExV4AdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: false,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'ZeroExV4Adapter'];
fn.dependencies = ['AddressListRegistry', 'Config', 'IntegrationManager'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD, Network.MATIC]);
};

export default fn;
