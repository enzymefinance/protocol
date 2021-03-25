import { IdleAdapterArgs } from '@enzymefinance/protocol';
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
  const idlePriceFeed = await get('IdlePriceFeed');

  await deploy('IdleAdapter', {
    args: [integrationManager.address, idlePriceFeed.address, config.weth, config.uniswap.router] as IdleAdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'IdleAdapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'IdlePriceFeed'];

export default fn;
