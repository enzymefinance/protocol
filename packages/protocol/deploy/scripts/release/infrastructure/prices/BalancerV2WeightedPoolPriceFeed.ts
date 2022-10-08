import { balancerV2GetPoolFromId, ValueInterpreter } from '@enzymefinance/protocol';
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

  const balancerV2WeightedPoolPriceFeed = await deploy('BalancerV2WeightedPoolPriceFeed', {
    args: [
      fundDeployer.address,
      valueInterpreter.address,
      config.weth,
      config.balancer.vault,
      config.balancer.poolsWeighted.poolFactories,
    ],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  // Register all weighted pool BPTs with the derivative price feed
  if (balancerV2WeightedPoolPriceFeed.newlyDeployed) {
    const pools = Object.values(config.balancer.poolsWeighted.pools);

    if (pools.length) {
      const valueInterpreterInstance = new ValueInterpreter(valueInterpreter.address, deployer);

      await valueInterpreterInstance.addDerivatives(
        pools.map((pool) => balancerV2GetPoolFromId(pool.id)),
        pools.map(() => balancerV2WeightedPoolPriceFeed.address),
      );
    }
  }
};

fn.tags = ['Release', 'BalancerV2WeightedPoolPriceFeed'];
fn.dependencies = ['Config', 'FundDeployer', 'ValueInterpreter'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
