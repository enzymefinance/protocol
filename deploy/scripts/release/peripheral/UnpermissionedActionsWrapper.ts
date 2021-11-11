import type { UnpermissionedActionsWrapperArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = (await hre.ethers.getSigners())[0];

  const feeManager = await get('FeeManager');

  await deploy('UnpermissionedActionsWrapper', {
    args: [feeManager.address] as UnpermissionedActionsWrapperArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Peripheral', 'UnpermissionedActionsWrapper'];
fn.dependencies = ['FeeManager'];

export default fn;
