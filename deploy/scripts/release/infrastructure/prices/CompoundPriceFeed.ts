import type { CompoundPriceFeedArgs } from '@enzymefinance/protocol';
import { CompoundPriceFeed } from '@enzymefinance/protocol';
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

  const compoundPriceFeed = await deploy('CompoundPriceFeed', {
    args: [fundDeployer.address, config.weth, config.compound.ceth] as CompoundPriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  // Register all uniswap pool tokens with the derivative price feed.
  if (compoundPriceFeed.newlyDeployed) {
    const ctokens = Object.values(config.compound.ctokens);

    if (ctokens.length) {
      log('Registering Compound cTokens');
      const compoundPriceFeedInstance = new CompoundPriceFeed(compoundPriceFeed.address, deployer);

      await compoundPriceFeedInstance.addCTokens(ctokens);
    }
  }
};

fn.tags = ['Release', 'CompoundPriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
