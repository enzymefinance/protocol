import {
  encodeFunctionData,
  ProtocolFeeReserveLib as ProtocolFeeReserveLibContract,
  ProtocolFeeReserveProxyArgs,
} from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');

  const protocolFeeReserveLib = await deploy('ProtocolFeeReserveLib', {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const constructData = encodeFunctionData(ProtocolFeeReserveLibContract.abi.getFunction('init'), [dispatcher.address]);
  const protocolFeeReserveProxy = await deploy('ProtocolFeeReserveProxy', {
    args: [constructData, protocolFeeReserveLib.address] as ProtocolFeeReserveProxyArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (!protocolFeeReserveProxy.newlyDeployed) {
    const protocolFeeReserveProxyInstance = new ProtocolFeeReserveLibContract(
      protocolFeeReserveProxy.address,
      deployer,
    );
    if ((await protocolFeeReserveProxyInstance.getProtocolFeeReserveLib()) != protocolFeeReserveLib.address) {
      log('Updating ProtocolFeeReserveLib on ProtocolFeeReserveProxy');
      await protocolFeeReserveProxyInstance.setProtocolFeeReserveLib(protocolFeeReserveLib.address);
    }
  }
};

fn.tags = ['Release', 'ProtocolFeeReserve'];
fn.dependencies = ['Dispatcher'];

export default fn;
