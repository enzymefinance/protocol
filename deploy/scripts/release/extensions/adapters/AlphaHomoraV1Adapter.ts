import { AlphaHomoraV1AdapterArgs } from '@enzymefinance/protocol';
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

  await deploy('AlphaHomoraV1Adapter', {
    args: [integrationManager.address, config.alphaHomoraV1.ibeth, config.weth] as AlphaHomoraV1AdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'AlphaHomoraV1Adapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

export default fn;
