import { sameAddress } from '@enzymefinance/ethers';
import type { ProtocolFeeReserveLibArgs, ProtocolFeeReserveProxyArgs } from '@enzymefinance/protocol';
import {
  encodeFunctionData,
  LIB_INIT_GENERIC_DUMMY_ADDRESS,
  ProtocolFeeReserveLib,
  ProtocolFeeReserveLib as ProtocolFeeReserveLibContract,
} from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');

  const protocolFeeReserveLib = await deploy('ProtocolFeeReserveLib', {
    args: [dispatcher.address, config.feeToken] as ProtocolFeeReserveLibArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (protocolFeeReserveLib.newlyDeployed) {
    const protocolFeeReserveLibInstance = new ProtocolFeeReserveLib(protocolFeeReserveLib, deployer);

    // Initialize the lib with dummy data to prevent another init() call
    await protocolFeeReserveLibInstance.init(LIB_INIT_GENERIC_DUMMY_ADDRESS);
  }

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

    if (!sameAddress(await protocolFeeReserveProxyInstance.getProtocolFeeReserveLib(), protocolFeeReserveLib.address)) {
      log('Updating ProtocolFeeReserveLib on ProtocolFeeReserveProxy');
      await protocolFeeReserveProxyInstance.setProtocolFeeReserveLib(protocolFeeReserveLib.address);
    }
  }
};

fn.tags = ['Release', 'ProtocolFeeReserve'];
fn.dependencies = ['Config', 'Dispatcher'];

export default fn;
