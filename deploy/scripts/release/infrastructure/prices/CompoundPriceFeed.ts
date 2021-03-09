import { CompoundPriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');

  const ctokens = Object.values(config.compound.ctokens);
  await deploy('CompoundPriceFeed', {
    args: [dispatcher.address, config.weth, config.compound.ceth, ctokens] as CompoundPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'CompoundPriceFeed'];
fn.dependencies = ['Config', 'Dispatcher'];

export default fn;
