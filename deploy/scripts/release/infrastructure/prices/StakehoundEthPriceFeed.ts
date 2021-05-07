import { StakehoundEthPriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  await deploy('StakehoundEthPriceFeed', {
    args: [config.stakehound.steth, config.weth] as StakehoundEthPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'StakehoundEthPriceFeed'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on kovan.
  const chain = parseInt(await hre.getChainId());
  return chain === 42;
};

export default fn;
