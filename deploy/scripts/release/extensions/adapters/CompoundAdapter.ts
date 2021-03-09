import { CompoundAdapterArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const integrationManager = await get('IntegrationManager');
  const compoundPriceFeed = await get('CompoundPriceFeed');

  await deploy('CompoundAdapter', {
    args: [integrationManager.address, compoundPriceFeed.address, config.weth] as CompoundAdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CompoundAdapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'CompoundPriceFeed'];

export default fn;
