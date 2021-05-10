import { SynthetixPriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  await deploy('SynthetixPriceFeed', {
    args: [
      fundDeployer.address,
      config.synthetix.addressResolver,
      config.synthetix.susd,
      Object.values(config.synthetix.synths),
    ] as SynthetixPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'SynthetixPriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];

export default fn;
