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

  await deploy('AaveV2ATokenListOwner', {
    args: [addressListRegistry.address, 'Aave v2: aTokens', config.aaveV2.lendingPoolAddressProvider],
    from: deployer.address,
    linkedData: {
      listId,
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'AaveV2ATokenListOwner'];
fn.dependencies = ['AddressListRegistry', 'Config'];

export default fn;
