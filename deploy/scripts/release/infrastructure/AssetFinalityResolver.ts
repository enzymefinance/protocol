import type { AssetFinalityResolverArgs } from '@enzymefinance/protocol';
import { AssetFinalityResolver as AssetFinalityResolverContract } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';
import { isOneOfNetworks, Network } from '../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const chain = await hre.getChainId();

  if (isOneOfNetworks(chain, [Network.HOMESTEAD])) {
    const config = await loadConfig(hre);
    const fundDeployer = await get('FundDeployer');
    const synthetixPriceFeed = await get('SynthetixPriceFeed');
    const assetFinalityResolver = await deploy('AssetFinalityResolver', {
      args: [
        fundDeployer.address,
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
  } else {
    await deploy('AssetFinalityResolver', {
      contract: 'NoOpAssetFinalityResolver',
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
    });
  }
};

fn.tags = ['Release', 'AssetFinalityResolver'];
fn.dependencies = ['Config', 'FundDeployer', 'SynthetixPriceFeed'];

export default fn;
