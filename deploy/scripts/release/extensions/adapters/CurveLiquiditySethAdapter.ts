import type { CurveLiquiditySethAdapterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const integrationManager = await get('IntegrationManager');

  await deploy('CurveLiquiditySethAdapter', {
    args: [
      integrationManager.address,
      config.curve.pools.seth.liquidityGaugeToken,
      config.curve.pools.seth.lpToken,
      config.curve.minter,
      config.curve.pools.seth.pool,
      config.primitives.crv,
      config.synthetix.synths.seth,
      config.weth,
    ] as CurveLiquiditySethAdapterArgs,
    from: deployer.address,
    linkedData: {
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CurveLiquiditySethAdapter'];
fn.dependencies = ['Config', 'IntegrationManager'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
