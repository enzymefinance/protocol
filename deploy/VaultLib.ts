import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const { deploy } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');

  await deploy('VaultLib', {
    from: deployer.address,
    log: true,
  });
};

fn.tags = ['Release', 'VaultLib'];

export default fn;
