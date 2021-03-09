import { ZeroExV2AdapterArgs } from '@enzymefinance/protocol';
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
  const fundDeployer = await get('FundDeployer');

  await deploy('ZeroExV2Adapter', {
    args: [
      integrationManager.address,
      config.zeroex.exchange,
      fundDeployer.address,
      config.zeroex.allowedMakers,
    ] as ZeroExV2AdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'ZeroExV2Adapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'FundDeployer'];

export default fn;
