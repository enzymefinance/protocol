import { DeployFunction } from 'hardhat-deploy/types';
import { FundDeployerArgs } from '@melonproject/protocol';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');

  const dispatcher = await get('Dispatcher');
  const vaultLib = await get('VaultLib');

  await deploy('FundDeployer', {
    from: deployer.address,
    log: true,
    // NOTE: Registration of vault contract calls is done in the adapter deployment phase.
    args: [dispatcher.address, vaultLib.address, [], []] as FundDeployerArgs,
  });
};

fn.tags = ['Release', 'FundDeployer'];
fn.dependencies = ['Dispatcher', 'VaultLib'];

export default fn;
