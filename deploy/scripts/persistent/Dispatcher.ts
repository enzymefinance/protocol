import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function ({ deployments: { deploy }, ethers: { getSigners } }) {
  const deployer = (await getSigners())[0];

  await deploy('Dispatcher', {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'Dispatcher'];

export default fn;
