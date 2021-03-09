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
  const dispatcher = await get('Dispatcher');

  await deploy('SynthetixPriceFeed', {
    args: [
      dispatcher.address,
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
fn.dependencies = ['Config'];

export default fn;
