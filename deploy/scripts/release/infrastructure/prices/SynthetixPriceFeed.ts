import type { SynthetixPriceFeedArgs } from '@enzymefinance/protocol';
import { SynthetixPriceFeed } from '@enzymefinance/protocol';
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

  const synthetixPriceFeed = await deploy('SynthetixPriceFeed', {
    args: [fundDeployer.address, config.synthetix.addressResolver, config.synthetix.susd] as SynthetixPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (synthetixPriceFeed.newlyDeployed) {
    const synthetixPriceFeedInstance = new SynthetixPriceFeed(synthetixPriceFeed.address, deployer);
    const synths = [config.synthetix.susd, ...Object.values(config.synthetix.synths)];

    if (!!synths.length) {
      log('Registering synths');
      await synthetixPriceFeedInstance.addSynths(synths);
    }
  }
};

fn.tags = ['Release', 'SynthetixPriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
