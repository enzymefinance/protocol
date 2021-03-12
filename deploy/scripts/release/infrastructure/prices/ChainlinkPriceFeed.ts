import { ChainlinkPriceFeed, ChainlinkPriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');

  const assets = Object.keys(config.primitives).map((key) => {
    if (!config.chainlink.aggregators[key]) {
      throw new Error(`Missing aggregator for ${key}`);
    }

    const aggregator = config.chainlink.aggregators[key];
    const primitive = config.primitives[key];
    return [primitive, ...aggregator] as const;
  });

  const primitives = assets.map(([primitive]) => primitive);
  const aggregators = assets.map(([, aggregator]) => aggregator);
  const rateAssets = assets.map(([, , rateAsset]) => rateAsset);

  const chainlinkPriceFeed = await deploy('ChainlinkPriceFeed', {
    args: [
      dispatcher.address,
      config.weth,
      config.chainlink.ethusd,
      primitives,
      aggregators,
      rateAssets,
    ] as ChainlinkPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (!hre.network.live && chainlinkPriceFeed.newlyDeployed) {
    const oneYear = 60 * 60 * 24 * 365;
    const chainlinkPriceFeedInstance = new ChainlinkPriceFeed(chainlinkPriceFeed.address, deployer);
    log('Setting stale rate threshold to one year for testing');
    await chainlinkPriceFeedInstance.setStaleRateThreshold(oneYear);
  }
};

fn.tags = ['Release', 'ChainlinkPriceFeed'];
fn.dependencies = ['Config', 'Dispatcher'];

export default fn;
