import type { PoolTogetherV4PriceFeedArgs } from '@enzymefinance/protocol';
import { PoolTogetherV4PriceFeed } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, log, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  const poolTogetherV4PriceFeed = await deploy('PoolTogetherV4PriceFeed', {
    args: [fundDeployer.address] as PoolTogetherV4PriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (poolTogetherV4PriceFeed.newlyDeployed && !hre.network.live) {
    const poolTogetherV4PriceFeedInstance = new PoolTogetherV4PriceFeed(poolTogetherV4PriceFeed.address, deployer);
    const ptTokenValues = Object.values(config.poolTogetherV4.ptTokens);

    if (ptTokenValues.length) {
      const ptTokenDerivatives = ptTokenValues.map(([derivative]) => derivative);
      const ptTokenUnderlyings = ptTokenValues.map(([, underlying]) => underlying);

      log('Registering poolTogether tokens');
      await poolTogetherV4PriceFeedInstance.addDerivatives(ptTokenDerivatives, ptTokenUnderlyings);
    }
  }
};

fn.tags = ['Release', 'PoolTogetherV4PriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD, Network.MATIC]);
};

export default fn;
