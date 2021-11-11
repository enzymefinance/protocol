import type { SynthetixAdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const integrationManager = await get('IntegrationManager');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');

  await deploy('SynthetixAdapter', {
    args: [
      integrationManager.address,
      synthetixPriceFeed.address,
      config.synthetix.originator,
      config.synthetix.snx,
      config.synthetix.trackingCode,
    ] as SynthetixAdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'SynthetixAdapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'SynthetixPriceFeed'];

export default fn;
