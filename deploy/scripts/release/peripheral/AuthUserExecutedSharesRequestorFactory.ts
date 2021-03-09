import type { AuthUserExecutedSharesRequestorFactoryArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = (await hre.ethers.getSigners())[0];

  const dispatcher = await get('Dispatcher');
  const authUserExecutedSharesRequestorLib = await deploy('AuthUserExecutedSharesRequestorLib', {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  await deploy('AuthUserExecutedSharesRequestorFactory', {
    args: [
      dispatcher.address,
      authUserExecutedSharesRequestorLib.address,
    ] as AuthUserExecutedSharesRequestorFactoryArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Peripheral', 'AuthUserExecutedSharesRequestorFactory'];
fn.dependencies = ['Dispatcher', 'AuthUserExecutedSharesRequestorLib'];

export default fn;
