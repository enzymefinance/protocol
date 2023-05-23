import type { DepositWrapperArgs } from '@enzymefinance/protocol';
import { FundDeployer } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const { deploy, get, log } = hre.deployments;
  const deployer = (await hre.ethers.getSigners())[0];

  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  const depositWrapper = await deploy('DepositWrapper', {
    args: [config.wrappedNativeAsset] as DepositWrapperArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (depositWrapper.newlyDeployed && !hre.network.live) {
    const fundDeployerInstance = new FundDeployer(fundDeployer.address, deployer);

    log('Adding DepositWrapper as buySharesOnBehalf caller on FundDeployer');
    await fundDeployerInstance.registerBuySharesOnBehalfCallers([depositWrapper]);
  }
};

fn.tags = ['Release', 'Peripheral', 'DepositWrapper'];
fn.dependencies = ['Config', 'FundDeployer'];

export default fn;
