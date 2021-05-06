import { AggregatedDerivativePriceFeed, UniswapV2PoolPriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');
  const valueInterpreter = await get('ValueInterpreter');
  const derivativePriceFeed = await get('AggregatedDerivativePriceFeed');

  const pools = Object.values(config.uniswap.pools);
  const uniswapPoolPriceFeed = await deploy('UniswapV2PoolPriceFeed', {
    args: [
      fundDeployer.address,
      derivativePriceFeed.address,
      chainlinkPriceFeed.address,
      valueInterpreter.address,
      config.uniswap.factory,
      pools,
    ] as UniswapV2PoolPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  // Register all uniswap pool tokens with the derivative price feed.
  if (uniswapPoolPriceFeed.newlyDeployed) {
    const derivativePriceFeedInstance = new AggregatedDerivativePriceFeed(derivativePriceFeed.address, deployer);

    if (!!pools.length) {
      log('Registering pool tokens');
      await derivativePriceFeedInstance.addDerivatives(
        pools,
        pools.map(() => uniswapPoolPriceFeed.address),
      );
    }
  }
};

fn.tags = ['Release', 'UniswapV2PoolPriceFeed'];
fn.dependencies = ['Config', 'FundDeployer', 'AggregatedDerivativePriceFeed', 'ChainlinkPriceFeed', 'ValueInterpreter'];

export default fn;
