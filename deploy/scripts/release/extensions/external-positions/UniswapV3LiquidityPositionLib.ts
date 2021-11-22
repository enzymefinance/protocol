import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const valueInterpreter = await get('ValueInterpreter');
  const config = await loadConfig(hre);

  await deploy('UniswapV3LiquidityPositionLib', {
    args: [config.uniswapV3.nonFungiblePositionManager, valueInterpreter.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ExternalPositions', 'UniswapV3LiquidityPositionLib'];
fn.dependencies = ['Config', 'ValueInterpreter'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
