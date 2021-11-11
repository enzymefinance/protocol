import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  const compoundPriceFeed = await get('CompoundPriceFeed');
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('CompoundDebtPositionParser', {
    args: [compoundPriceFeed.address, config.primitives.comp, valueInterpreter.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'CompoundDebtPositionParser'];
fn.dependencies = ['CompoundPriceFeed', 'Config', 'ValueInterpreter'];
export default fn;
