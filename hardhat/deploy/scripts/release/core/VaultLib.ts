import type { VaultLibArgs } from '@enzymefinance/protocol';
import {
  FundDeployer as FundDeployerContract,
  LIB_INIT_GENERIC_DUMMY_ADDRESS,
  VaultLib,
} from '@enzymefinance/protocol';
import { constants } from 'ethers';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, getOrNull, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const externalPositionManager = await get('ExternalPositionManager');
  const fundDeployer = await get('FundDeployer');
  const gasRelayPaymasterFactory = await getOrNull('GasRelayPaymasterFactory');
  const protocolFeeReserveProxy = await get('ProtocolFeeReserveProxy');
  const protocolFeeTracker = await get('ProtocolFeeTracker');

  const feeTokenBurner = config.feeTokenBurn.burnFromVault
    ? constants.AddressZero
    : config.feeTokenBurn.sendToProtocolFeeReserve
    ? protocolFeeReserveProxy.address
    : config.feeTokenBurn.externalBurnerAddress;

  const vaultLib = await deploy('VaultLib', {
    args: [
      externalPositionManager.address,
      gasRelayPaymasterFactory?.address ?? constants.AddressZero,
      protocolFeeReserveProxy.address,
      protocolFeeTracker.address,
      config.feeToken,
      feeTokenBurner,
      config.wrappedNativeAsset,
      config.positionsLimit,
    ] as VaultLibArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (vaultLib.newlyDeployed) {
    const vaultLibInstance = new VaultLib(vaultLib, deployer);

    // Initialize the lib with dummy data to prevent another init() call
    await vaultLibInstance.init(LIB_INIT_GENERIC_DUMMY_ADDRESS, LIB_INIT_GENERIC_DUMMY_ADDRESS, '');

    const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);

    log('Updating VaultLib on FundDeployer');
    await fundDeployerInstance.setVaultLib(vaultLib.address);
  }
};

fn.tags = ['Release', 'VaultLib'];
fn.dependencies = [
  'Config',
  'ExternalPositionManager',
  'GasRelayPaymasterFactory',
  'ProtocolFeeReserve',
  'ProtocolFeeTracker',
];

export default fn;
