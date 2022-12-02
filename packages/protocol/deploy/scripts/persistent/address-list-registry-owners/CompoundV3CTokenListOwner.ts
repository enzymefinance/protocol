import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';
import { getListId } from '../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { save, deploy, get, getOrNull },
    ethers: { getSigners },
  } = hre;

  if (!(await getOrNull('CompoundV3CTokenListOwner'))) {
    const config = await loadConfig(hre);
    const deployer = (await getSigners())[0];
    const addressListRegistry = await get('AddressListRegistry');

    const deployment = await deploy('CompoundV3CTokenListOwner', {
      args: [addressListRegistry.address, 'Compound v3: cTokens', config.compoundV3.configuratorProxy],
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
    });

    if (deployment.newlyDeployed) {
      const listId = getListId(deployment.receipt!);

      await save('CompoundV3CTokenListOwner', {
        ...deployment,
        linkedData: {
          ...deployment.linkedData,
          listId: listId.toString(),
        },
      });
    }
  }
};

fn.tags = ['Persistent', 'CompoundV3CTokenListOwner'];
fn.dependencies = ['AddressListRegistry', 'Config'];

export default fn;
