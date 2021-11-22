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
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
