import type { CurveLiquidityEursAdapterArgs } from '@enzymefinance/protocol';
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
      nonSlippageAdapter: true,
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'CurveLiquidityEursAdapter'];
fn.dependencies = ['Config', 'IntegrationManager'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
