import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];

  await deploy('VaultLib', {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'VaultLib'];

export default fn;
