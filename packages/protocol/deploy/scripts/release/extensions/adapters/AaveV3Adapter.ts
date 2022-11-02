import type { AaveV3AdapterArgs } from '@enzymefinance/protocol';
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

  const aaveV3ATokenListOwner = await get('AaveV3ATokenListOwner');
  const addressListRegistry = await get('AddressListRegistry');
  const integrationManager = await get('IntegrationManager');

  await deploy('AaveV3Adapter', {
    args: [
      integrationManager.address,
      addressListRegistry.address,
      aaveV3ATokenListOwner.linkedData.listId,
      aaveV3ATokenListOwner.address,
      config.aaveV3.pool,
      config.aaveV3.referralCode,
    ] as AaveV3AdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'AaveV3Adapter'];
fn.dependencies = ['AaveV3ATokenListOwner', 'AddressListRegistry', 'Config', 'IntegrationManager'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD, Network.MATIC]);
};

export default fn;
