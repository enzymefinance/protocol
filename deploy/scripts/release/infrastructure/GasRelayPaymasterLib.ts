import type { GasRelayPaymasterLibArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];

  await deploy('GasRelayPaymasterLib', {
    args: [config.weth, config.gsn.relayHub, config.gsn.trustedForwarder] as GasRelayPaymasterLibArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'GasRelayPaymasterLib'];
fn.dependencies = ['Config'];

export default fn;
