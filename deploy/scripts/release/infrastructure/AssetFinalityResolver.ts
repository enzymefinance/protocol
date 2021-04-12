import {
  AssetFinalityResolver as AssetFinalityResolverContract,
  AssetFinalityResolverArgs,
} from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');

  const assetFinalityResolver = await deploy('AssetFinalityResolver', {
    args: [
      dispatcher.address,
      synthetixPriceFeed.address,
      config.synthetix.addressResolver,
    ] as AssetFinalityResolverArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (!assetFinalityResolver.newlyDeployed) {
    const assetFinalityResolverInstance = new AssetFinalityResolverContract(assetFinalityResolver.address, deployer);
    if ((await assetFinalityResolverInstance.getSynthetixPriceFeed()) != synthetixPriceFeed.address) {
      log('Updating synthetixPriceFeed on AssetFinalityResolver');
      await assetFinalityResolverInstance.setSynthetixPriceFeed(synthetixPriceFeed.address);
    }
  }
};

fn.tags = ['Release', 'AssetFinalityResolver'];
fn.dependencies = ['Config', 'Dispatcher', 'SynthetixPriceFeed'];

export default fn;
