import type { GasRelayPaymasterLibArgs } from '@enzymefinance/protocol';
import { GasRelayPaymasterLib, LIB_INIT_GENERIC_DUMMY_ADDRESS } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];

  if (config.gsn) {
    const gasRelayPaymasterLib = await deploy('GasRelayPaymasterLib', {
      args: [config.weth, config.gsn.relayHub, config.gsn.trustedForwarder] as GasRelayPaymasterLibArgs,
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
    });

    if (gasRelayPaymasterLib.newlyDeployed) {
      const gasRelayPaymasterLibInstance = new GasRelayPaymasterLib(gasRelayPaymasterLib, deployer);
      // Initialize the lib with dummy data to prevent another init() call
      await gasRelayPaymasterLibInstance.init(LIB_INIT_GENERIC_DUMMY_ADDRESS);
    }
  }
};

fn.tags = ['Release', 'GasRelayPaymasterLib'];
fn.dependencies = ['Config'];

export default fn;
