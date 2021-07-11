import { CurveLiquidityAaveAdapterArgs } from '@enzymefinance/protocol';
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

  await deploy('CurveLiquidityAaveAdapter', {
    args: [
      integrationManager.address,
      config.curve.pools.aave.liquidityGaugeToken,
      config.curve.pools.aave.lpToken,
      config.curve.minter,
      config.curve.pools.aave.pool,
      config.primitives.crv,
      [config.aave.atokens.adai[0], config.aave.atokens.ausdc[0], config.aave.atokens.ausdt[0]],
      [config.primitives.dai, config.primitives.usdc, config.primitives.usdt],
    ] as CurveLiquidityAaveAdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CurveLiquidityAaveAdapter'];
fn.dependencies = ['Config', 'IntegrationManager'];

export default fn;
