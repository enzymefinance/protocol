import type { AllowedExternalPositionTypesPerManagerPolicyArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const uintListRegistry = await get('UintListRegistry');
  const policyManager = await get('PolicyManager');

  await deploy('AllowedExternalPositionTypesPerManagerPolicy', {
    args: [policyManager.address, uintListRegistry.address] as AllowedExternalPositionTypesPerManagerPolicyArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Policies', 'AllowedExternalPositionTypesPerManagerPolicy'];
fn.dependencies = ['UintListRegistry', 'PolicyManager'];

export default fn;
