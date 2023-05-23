import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';
import { getListId } from '../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { save, deploy, get, getOrNull },
    ethers: { getSigners },
  } = hre;

  if (!(await getOrNull('AaveV2ATokenListOwner'))) {
    const config = await loadConfig(hre);
    const deployer = (await getSigners())[0];
    const addressListRegistry = await get('AddressListRegistry');

    const deployment = await deploy('AaveV2ATokenListOwner', {
      args: [addressListRegistry.address, 'Aave v2: aTokens', config.aaveV2.lendingPoolAddressProvider],
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
    });

    if (deployment.newlyDeployed) {
      const listId = getListId(deployment.receipt!);

      await save('AaveV2ATokenListOwner', {
        ...deployment,
        linkedData: {
          ...deployment.linkedData,
          listId: listId.toString(),
        },
      });
    }
  }
};

fn.tags = ['Persistent', 'AaveV2ATokenListOwner'];
fn.dependencies = ['AddressListRegistry', 'Config'];

export default fn;
