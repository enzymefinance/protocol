import {
  encodeFunctionData,
  GlobalConfigLib as GlobalConfigLibContract,
  GlobalConfigProxyArgs,
} from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');

  const globalConfigLib = await deploy('GlobalConfigLib', {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const constructData = encodeFunctionData(GlobalConfigLibContract.abi.getFunction('init'), [dispatcher.address]);
  const globalConfigProxy = await deploy('GlobalConfigProxy', {
    args: [constructData, globalConfigLib.address] as GlobalConfigProxyArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (!globalConfigProxy.newlyDeployed) {
    const globalConfigProxyInstance = new GlobalConfigLibContract(globalConfigProxy.address, deployer);
    if ((await globalConfigProxyInstance.getGlobalConfigLib()) != globalConfigLib.address) {
      log('Updating GlobalConfigLib on GlobalConfigProxy');
      await globalConfigProxyInstance.setGlobalConfigLib(globalConfigLib.address);
    }
  }
};

fn.tags = ['Persistent', 'GlobalConfig'];
fn.dependencies = ['Dispatcher'];

export default fn;
