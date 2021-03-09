import { ChaiPriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  await deploy('ChaiPriceFeed', {
    args: [config.chai.chai, config.chai.dai, config.chai.pot] as ChaiPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ChaiPriceFeed'];
fn.dependencies = ['Config'];

export default fn;
