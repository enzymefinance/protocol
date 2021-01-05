import { DeployFunction } from 'hardhat-deploy/types';
import type { PolicyManagerArgs } from '@melonproject/protocol';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');

  const fundDeployer = await get('FundDeployer');

  await deploy('PolicyManager', {
    from: deployer.address,
    log: true,
    args: [fundDeployer.address] as PolicyManagerArgs,
  });
};

fn.tags = ['Release', 'PolicyManager'];
fn.dependencies = ['FundDeployer'];

export default fn;
