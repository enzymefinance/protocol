import { AaveAdapterArgs } from '@enzymefinance/protocol';
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
  const aavePriceFeed = await get('AavePriceFeed');

  await deploy('AaveAdapter', {
    args: [
      integrationManager.address,
      config.aave.lendingPoolAddressProvider,
      aavePriceFeed.address,
    ] as AaveAdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'AaveAdapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'AavePriceFeed'];
fn.skip = async (hre) => {
  // Skip this on kovan.
  const chain = parseInt(await hre.getChainId());
  return chain === 42;
};

export default fn;
