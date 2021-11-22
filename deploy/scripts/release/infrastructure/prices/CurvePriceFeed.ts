import type { CurvePriceFeedArgs } from '@enzymefinance/protocol';
import { CurvePriceFeed } from '@enzymefinance/protocol';
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

  const curvePriceFeed = await deploy('CurvePriceFeed', {
    args: [fundDeployer.address, config.curve.addressProvider] as CurvePriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (curvePriceFeed.newlyDeployed) {
    const curvePriceFeedInstance = new CurvePriceFeed(curvePriceFeed.address, deployer);
    const pools = Object.values(config.curve.pools);

    if (!!pools.length) {
      const flattened = pools.flatMap((pool) => {
        return [
          [pool.liquidityGaugeToken, pool.invariantProxyAsset],
          [pool.lpToken, pool.invariantProxyAsset],
        ] as const;
      });

      log('Registering curve tokens');
      const derivatives = flattened.map(([derivative]) => derivative);
      const underlyings = flattened.map(([, underlying]) => underlying);
      await curvePriceFeedInstance.addDerivatives(derivatives, underlyings);
    }
  }
};

fn.tags = ['Release', 'CurvePriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
