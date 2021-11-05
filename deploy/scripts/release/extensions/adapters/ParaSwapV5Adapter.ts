import { ParaSwapV5AdapterArgs } from '@enzymefinance/protocol';
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

  await deploy('ParaSwapV5Adapter', {
    args: [
      integrationManager.address,
      config.paraSwapV5.augustusSwapper,
      config.paraSwapV5.tokenTransferProxy,
    ] as ParaSwapV5AdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'ParaSwapV5Adapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

export default fn;
