import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const globalConfig = await get('GlobalConfigProxy');

  await deploy('GatedRedemptionQueueSharesWrapperLib', {
    args: [globalConfig.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'GatedRedemptionQueueSharesWrapperLib'];
fn.dependencies = ['GlobalConfigProxy'];

export default fn;
