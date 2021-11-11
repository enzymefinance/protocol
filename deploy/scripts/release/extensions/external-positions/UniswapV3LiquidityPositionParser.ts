import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('UniswapV3LiquidityPositionParser', {
    args: [valueInterpreter.address, config.uniswapV3.nonFungiblePositionManager],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ExternalPositions', 'UniswapV3LiquidityPositionParser'];
fn.dependencies = ['Config', 'ValueInterpreter'];

export default fn;
