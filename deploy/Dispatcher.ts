import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const { deploy } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');

  await deploy('Dispatcher', {
    from: deployer.address,
    log: true,
  });
};

fn.tags = ['Persistent', 'Dispatcher'];

export default fn;
