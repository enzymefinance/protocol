import type { FundActionsWrapperArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = (await hre.ethers.getSigners())[0];

  const config = await loadConfig(hre);
  const feeManager = await get('FeeManager');

  await deploy('FundActionsWrapper', {
    args: [feeManager.address, config.weth] as FundActionsWrapperArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Peripheral', 'FundActionsWrapper'];
fn.dependencies = ['FeeManager'];

export default fn;
