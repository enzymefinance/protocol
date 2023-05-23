import type { ZeroExV2AdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

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
      config.zeroexV2.exchange,
      fundDeployer.address,
      config.zeroexV2.allowedMakers,
    ] as ZeroExV2AdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'ZeroExV2Adapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'FundDeployer'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
