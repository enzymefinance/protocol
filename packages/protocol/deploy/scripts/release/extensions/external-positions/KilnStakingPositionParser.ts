import { AddressListRegistry, AddressListUpdateType } from '@enzymefinance/protocol';
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

  const addressListRegistry = await get('AddressListRegistry');
  const dispatcher = await get('Dispatcher');

  // Create a list with the known Kiln StakingContract instances
  const addressListRegistryContract = new AddressListRegistry(addressListRegistry.address, deployer);
  const stakingContractsListId = await addressListRegistryContract.getListCount();
  await addressListRegistryContract.createList(dispatcher.address, AddressListUpdateType.AddAndRemove, [
    config.kiln.stakingContract,
  ]);

  await deploy('KilnStakingPositionParser', {
    args: [addressListRegistry.address, stakingContractsListId, config.weth],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ExternalPositions', 'KilnStakingPositionParser'];
fn.dependencies = ['AddressListRegistry', 'Config', 'Dispatcher'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
