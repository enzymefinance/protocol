import { CurveLiquidityEursAdapterArgs } from '@enzymefinance/protocol';
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

  await deploy('CurveLiquidityEursAdapter', {
    args: [
      integrationManager.address,
      config.curve.pools.eurs.liquidityGaugeToken,
      config.curve.pools.eurs.lpToken,
      config.curve.minter,
      config.curve.pools.eurs.pool,
      config.primitives.crv,
      config.unsupportedAssets.eurs,
      config.synthetix.synths.seur,
    ] as CurveLiquidityEursAdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
      nonSlippageAdapter: true,
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CurveLiquidityEursAdapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

export default fn;
