import { balancerV2GetPoolFromId, BalancerV2StablePoolPriceFeed, ValueInterpreter } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');
  const valueInterpreter = await get('ValueInterpreter');

  const pools = Object.values(config.balancer.poolsStable.pools);

  const balancerV2StablePoolPriceFeed = await deploy('BalancerV2StablePoolPriceFeed', {
    args: [
      fundDeployer.address,
      config.wrappedNativeAsset,
      config.balancer.vault,
      config.balancer.poolsStable.poolFactories,
    ],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (pools.length) {
    // Register all stable pool BPTs with the derivative price feed
    if (balancerV2StablePoolPriceFeed.newlyDeployed) {
      const balancerV2StablePoolPriceFeedInstance = new BalancerV2StablePoolPriceFeed(
        balancerV2StablePoolPriceFeed.address,
        deployer,
      );
      await balancerV2StablePoolPriceFeedInstance.addPools(
        pools.map((pool) => balancerV2GetPoolFromId(pool.id)),
        pools.map((pool) => pool.invariantProxyAsset),
      );
    }

    // Register all stable pool BPTs with the ValueInterpreter
    const valueInterpreterInstance = new ValueInterpreter(valueInterpreter.address, deployer);

    await valueInterpreterInstance.addDerivatives(
      pools.map((pool) => balancerV2GetPoolFromId(pool.id)),
      pools.map(() => balancerV2StablePoolPriceFeed.address),
    );
  }
};

fn.tags = ['Release', 'BalancerV2StablePoolPriceFeed'];
fn.dependencies = ['Config', 'FundDeployer', 'ValueInterpreter'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD, Network.MATIC]);
};

export default fn;
