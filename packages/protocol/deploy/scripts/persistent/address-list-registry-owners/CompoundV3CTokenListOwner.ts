import { AddressListRegistry } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];

  const addressListRegistry = await get('AddressListRegistry');
  const listId = await new AddressListRegistry(addressListRegistry.address, deployer).getListCount();

  await deploy('CompoundV3CTokenListOwner', {
    args: [addressListRegistry.address, 'Compound v3: cTokens', config.compoundV3.configuratorProxy],
    from: deployer.address,
    linkedData: {
      listId,
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'CompoundV3CTokenListOwner'];
fn.dependencies = ['AddressListRegistry', 'Config'];

export default fn;
