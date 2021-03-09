import { UniswapV2AdapterArgs } from '@enzymefinance/protocol';
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

  await deploy('UniswapV2Adapter', {
    args: [integrationManager.address, config.uniswap.router, config.uniswap.factory] as UniswapV2AdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'UniswapV2Adapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

export default fn;
