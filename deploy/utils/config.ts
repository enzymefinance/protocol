import type { DeploymentConfig } from '@enzymefinance/testutils';
import { constants } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

export async function saveConfig(hre: HardhatRuntimeEnvironment, data: DeploymentConfig) {
  await hre.deployments.save('Config', {
    abi: [],
    address: constants.AddressZero,
    linkedData: data,
  });
}

export async function loadConfig(hre: HardhatRuntimeEnvironment) {
  const deployment = await hre.deployments.get('Config');

  return deployment.linkedData as DeploymentConfig;
}

export async function hasConfig(hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return !!(await hre.deployments.getOrNull('Config'));
}

const fn: DeployFunction = async () => {
  // Nothing to do here.
};

fn.tags = ['Config'];

export default fn;
