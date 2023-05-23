import type { CumulativeSlippageTolerancePolicyArgs } from '@enzymefinance/protocol';
import { AddressListRegistry, AddressListUpdateType, ONE_DAY_IN_SECONDS } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { getListId } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, getOrNull, all },
    ethers: { getSigners },
  } = hre;

  if (!(await getOrNull('CumulativeSlippageTolerancePolicy'))) {
    const config = await loadConfig(hre);
    const deployer = (await getSigners())[0];
    const dispatcher = await get('Dispatcher');
    const policyManager = await get('PolicyManager');
    const valueInterpreter = await get('ValueInterpreter');

    const nonSlippageAdapters = Object.values(await all())
      .filter((item) => item.linkedData?.type === 'ADAPTER' && item.linkedData?.nonSlippageAdapter)
      .map((item) => item.address.toLowerCase());

    const addressListRegistry = await get('AddressListRegistry');
    const addressListRegistryContract = new AddressListRegistry(addressListRegistry.address, deployer);
    const nonSlippageAdaptersListId = getListId(
      await addressListRegistryContract.createList(
        dispatcher.address,
        AddressListUpdateType.AddAndRemove,
        nonSlippageAdapters,
      ),
    );

    await deploy('CumulativeSlippageTolerancePolicy', {
      args: [
        policyManager.address,
        addressListRegistry.address,
        valueInterpreter.address,
        config.weth,
        nonSlippageAdaptersListId,
        ONE_DAY_IN_SECONDS * 7, // tolerance period duration
        ONE_DAY_IN_SECONDS * 7, // priceless asset bypass timelock
        ONE_DAY_IN_SECONDS * 2, // priceless asset bypass time limit
      ] as CumulativeSlippageTolerancePolicyArgs,
      from: deployer.address,
      linkedData: {
        type: 'POLICY',
      },
      log: true,
      skipIfAlreadyDeployed: true,
    });
  }
};

fn.tags = ['Release', 'Policies', 'CumulativeSlippageTolerancePolicy'];
fn.dependencies = ['Config', 'AddressRegistryList', 'PolicyManager', 'ValueInterpreter', 'Adapters'];

export default fn;
