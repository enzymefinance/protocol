import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];

  const dispatcher = await get('Dispatcher');
  const gatedRedemptionQueueSharesWrapperLib = await get('GatedRedemptionQueueSharesWrapperLib');

  await deploy('GatedRedemptionQueueSharesWrapperFactory', {
    args: [dispatcher.address, gatedRedemptionQueueSharesWrapperLib.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'GatedRedemptionQueueSharesWrapperFactory'];
fn.dependencies = ['Dispatcher', 'GatedRedemptionQueueSharesWrapperLib'];

export default fn;
