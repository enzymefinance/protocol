import type { GasRelayPaymasterFactoryArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');
  const gasRelayPaymasterLib = await get('GasRelayPaymasterLib');

  await deploy('GasRelayPaymasterFactory', {
    args: [dispatcher.address, gasRelayPaymasterLib.address] as GasRelayPaymasterFactoryArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'GasRelayPaymasterFactory'];
fn.dependencies = ['Dispatcher', 'GasRelayPaymasterLib'];

export default fn;
