import type { FusePriceFeedArgs } from '@enzymefinance/protocol';
import { FusePriceFeed } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  const fusePriceFeed = await deploy('FusePriceFeed', {
    args: [fundDeployer.address, config.weth] as FusePriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  // Register all tokens with the derivative price feed"
  if (fusePriceFeed.newlyDeployed) {
    const ftokens = Object.values(config.fuse.ftokens);
    const fetherTokens = Object.values(config.fuse.fetherTokens);
    if (!!ftokens.length) {
      log('Registering Fuse fTokens');
      const fusePriceFeedInstance = new FusePriceFeed(fusePriceFeed.address, deployer);
      await fusePriceFeedInstance.addCTokens(ftokens);
      await fusePriceFeedInstance.addCEtherTokens(fetherTokens);
    }
  }
};

fn.tags = ['Release', 'FusePriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
