import type { AaveV2AdapterArgs } from '@enzymefinance/protocol';
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
  const integrationManager = await get('IntegrationManager');

  await deploy('AaveV2Adapter', {
    args: [integrationManager.address, config.aaveV2.lendingPool] as AaveV2AdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'AaveV2Adapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD, Network.MATIC]);
};

export default fn;
