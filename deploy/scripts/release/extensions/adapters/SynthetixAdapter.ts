import type { SynthetixAdapterArgs } from '@enzymefinance/protocol';
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
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('SynthetixAdapter', {
    args: [
      integrationManager.address,
      valueInterpreter.address,
      config.synthetix.originator,
      config.synthetix.redeemer,
      config.synthetix.snx,
      config.synthetix.susd,
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
fn.dependencies = ['Config', 'IntegrationManager', 'ValueInterpreter'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
