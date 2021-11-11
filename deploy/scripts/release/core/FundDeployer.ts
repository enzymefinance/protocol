import type { FundDeployerArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');
  const gasRelayPaymasterFactory = await get('GasRelayPaymasterFactory');

  await deploy('FundDeployer', {
    args: [dispatcher.address, gasRelayPaymasterFactory.address] as FundDeployerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'FundDeployer'];
fn.dependencies = ['Config', 'Dispatcher', 'GasRelayPaymasterFactory'];

export default fn;
