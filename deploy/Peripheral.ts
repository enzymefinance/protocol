import { DeployFunction } from 'hardhat-deploy/types';
import type { FundActionsWrapperArgs, AuthUserExecutedSharesRequestorFactoryArgs } from '@enzymefinance/protocol';
import { loadConfig } from './config/Config';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const config = await loadConfig(hre);

  const dispatcher = await get('Dispatcher');
  const feeManager = await get('FeeManager');

  const authUserExecutedSharesRequestorLib = await deploy('AuthUserExecutedSharesRequestorLib', {
    from: deployer.address,
    log: true,
  });

  await deploy('AuthUserExecutedSharesRequestorFactory', {
    from: deployer.address,
    log: true,
    args: [
      dispatcher.address,
      authUserExecutedSharesRequestorLib.address,
    ] as AuthUserExecutedSharesRequestorFactoryArgs,
  });

  await deploy('FundActionsWrapper', {
    from: deployer.address,
    log: true,
    args: [feeManager.address, config.weth] as FundActionsWrapperArgs,
  });
};

fn.tags = ['Peripheral'];
fn.dependencies = ['Config', 'Dispatcher', 'FeeManager'];

export default fn;
