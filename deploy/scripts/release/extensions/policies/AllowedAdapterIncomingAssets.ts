import { AllowedAdapterIncomingAssetsArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const policyManager = await get('PolicyManager');

  await deploy('AllowedAdapterIncomingAssets', {
    args: [policyManager.address] as AllowedAdapterIncomingAssetsArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Policies', 'AllowedAdapterIncomingAssets'];
fn.dependencies = ['PolicyManager'];

export default fn;
