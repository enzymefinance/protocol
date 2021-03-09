import { CurveLiquidityStethAdapterArgs } from '@enzymefinance/protocol';
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

  await deploy('CurveLiquidityStethAdapter', {
    args: [
      integrationManager.address,
      config.curve.pools.steth.liquidityGaugeToken,
      config.curve.pools.steth.lpToken,
      config.curve.pools.steth.pool,
      config.lido.steth,
      config.weth,
    ] as CurveLiquidityStethAdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CurveLiquidityStethAdapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

export default fn;
