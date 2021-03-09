import { PolicyManager } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, all, log },
    ethers: { getSigners },
  } = hre;
  const policies = Object.values(await all())
    .filter((item) => item.linkedData?.type === 'POLICY')
    .map((item) => item.address.toLowerCase());

  if (policies.length) {
    const deployer = (await getSigners())[0];
    const policyManager = await get('PolicyManager');
    const policyManagerInstance = new PolicyManager(policyManager.address, deployer);
    log('Registering policies.');
    await policyManagerInstance.registerPolicies(policies);
  }
};

fn.tags = ['Release', 'Policies', 'RegisterPolicies'];
fn.dependencies = ['PolicyManager'];
fn.runAtTheEnd = true;

export default fn;
