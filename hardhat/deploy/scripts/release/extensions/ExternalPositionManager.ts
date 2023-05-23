import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const externalPositionFactory = await get('ExternalPositionFactory');
  const policyManager = await get('PolicyManager');

  await deploy('ExternalPositionManager', {
    args: [fundDeployer.address, externalPositionFactory.address, policyManager.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ExternalPositionManager'];
fn.dependencies = ['ExternalPositionFactory', 'FundDeployer', 'PolicyManager'];

export default fn;
