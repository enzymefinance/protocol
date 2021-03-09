import { AlphaHomoraV1PriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  await deploy('AlphaHomoraV1PriceFeed', {
    args: [config.alphaHomoraV1.ibeth, config.weth] as AlphaHomoraV1PriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'AlphaHomoraV1PriceFeed'];
fn.dependencies = ['Config'];

export default fn;
