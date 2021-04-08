import { ParaSwapV4AdapterArgs } from '@enzymefinance/protocol';
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

  await deploy('ParaSwapV4Adapter', {
    args: [
      integrationManager.address,
      config.paraSwapV4.augustusSwapper,
      config.paraSwapV4.tokenTransferProxy,
    ] as ParaSwapV4AdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'ParaSwapV4Adapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

export default fn;
