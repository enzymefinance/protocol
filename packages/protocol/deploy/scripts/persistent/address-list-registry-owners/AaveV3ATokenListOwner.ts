import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';
import { getListId } from '../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { save, deploy, get, getOrNull },
    ethers: { getSigners },
  } = hre;

  if (!(await getOrNull('AaveV3ATokenListOwner'))) {
    const config = await loadConfig(hre);
    const deployer = (await getSigners())[0];
    const addressListRegistry = await get('AddressListRegistry');

    const deployment = await deploy('AaveV3ATokenListOwner', {
      args: [addressListRegistry.address, 'Aave v3: aTokens', config.aaveV3.poolAddressProvider],
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
    });

    if (deployment.newlyDeployed) {
      const listId = getListId(deployment.receipt!);

      await save('AaveV3ATokenListOwner', {
        ...deployment,
        linkedData: {
          ...deployment.linkedData,
          listId: listId.toString(),
        },
      });
    }
  }
};

fn.tags = ['Persistent', 'AaveV3ATokenListOwner'];
fn.dependencies = ['AddressListRegistry', 'Config'];

export default fn;
