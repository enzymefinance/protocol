import { ChainlinkPriceFeedArgs } from '@enzymefinance/protocol';
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

  await deploy('ChainlinkPriceFeed', {
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
};

fn.tags = ['Release', 'ChainlinkPriceFeed'];
fn.dependencies = ['Config', 'Dispatcher'];

export default fn;
