import { ValueInterpreter } from '@enzymefinance/protocol';
import { constants } from 'ethers';
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
  const valueInterpreter = await get('ValueInterpreter');

  const balancerV2GaugeTokenPriceFeed = await deploy('BalancerV2GaugeTokenPriceFeed', {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  // Register all tokens with the derivative price feed
  if (balancerV2GaugeTokenPriceFeed.newlyDeployed && !hre.network.live) {
    const pools = [
      ...Object.values(config.balancer.poolsWeighted.pools).filter((item) => item.gauge !== constants.AddressZero),
      ...Object.values(config.balancer.poolsStable.pools).filter((item) => item.gauge !== constants.AddressZero),
    ];

    if (pools.length) {
      const valueInterpreterInstance = new ValueInterpreter(valueInterpreter.address, deployer);

      await valueInterpreterInstance.addDerivatives(
        pools.map((pool) => pool.gauge as string),
        pools.map(() => balancerV2GaugeTokenPriceFeed.address),
      );
    }
  }
};

fn.tags = ['Release', 'BalancerV2GaugeTokenPriceFeed'];
fn.dependencies = ['Config', 'FundDeployer', 'ValueInterpreter'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD, Network.MATIC]);
};

export default fn;
