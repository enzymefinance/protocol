import type { CurveLiquidityAaveAdapterArgs } from '@enzymefinance/protocol';
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
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CurveLiquidityAaveAdapter'];
fn.dependencies = ['Config', 'IntegrationManager'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
