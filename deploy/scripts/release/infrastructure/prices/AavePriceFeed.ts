import { AavePriceFeed, AavePriceFeedArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, log, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  const aavePriceFeed = await deploy('AavePriceFeed', {
    args: [fundDeployer.address, config.aave.protocolDataProvider] as AavePriceFeedArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (aavePriceFeed.newlyDeployed) {
    const aavePriceFeedInstance = new AavePriceFeed(aavePriceFeed.address, deployer);
    const atokenValues = Object.values(config.aave.atokens);

    if (!!atokenValues.length) {
      const atokenDerivatives = atokenValues.map(([derivative]) => derivative);
      const atokenUnderlyings = atokenValues.map(([, underlying]) => underlying);
      log('Registering aave tokens');
      await aavePriceFeedInstance.addDerivatives(atokenDerivatives, atokenUnderlyings);
    }
  }
};

fn.tags = ['Release', 'AavePriceFeed'];
fn.dependencies = ['Config', 'FundDeployer'];
fn.skip = async (hre) => {
  // Skip this on kovan.
  const chain = parseInt(await hre.getChainId());
  return chain === 42;
};

export default fn;
