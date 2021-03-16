import { FundDeployerArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');
  const vaultLib = await get('VaultLib');

  await deploy('FundDeployer', {
    args: [
      dispatcher.address,
      vaultLib.address,
      config.vaultCalls.map(([address]) => address),
      config.vaultCalls.map(([, selector]) => selector),
    ] as FundDeployerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'FundDeployer'];
fn.dependencies = ['Config', 'Dispatcher', 'VaultLib'];

export default fn;
