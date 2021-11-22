import type { IdlePriceFeedArgs } from '@enzymefinance/protocol';
import { IdlePriceFeed, IIdleTokenV4 } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  const idlePriceFeed = await deploy('IdlePriceFeed', {
    args: [fundDeployer.address] as IdlePriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (idlePriceFeed.newlyDeployed) {
    const idlePriceFeedInstance = new IdlePriceFeed(idlePriceFeed.address, deployer);
    const idleTokens = Object.values(config.idle);
    const underlyings = await Promise.all(
      idleTokens.map((idleTokenAddress) => {
        const idleToken = new IIdleTokenV4(idleTokenAddress, deployer);

        return idleToken.token();
      }),
    );

    if (!!idleTokens.length) {
      log('Registering idle tokens');
      await idlePriceFeedInstance.addDerivatives(idleTokens, underlyings);
    }
  }
};

fn.tags = ['Release', 'IdlePriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
