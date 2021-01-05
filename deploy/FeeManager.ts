import { DeployFunction } from 'hardhat-deploy/types';
import type { FeeManagerArgs } from '@melonproject/protocol';

const fn: DeployFunction = async function (hre) {
  const { deploy } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');

  const fundDeployer = await hre.deployments.get('FundDeployer');

  await deploy('FeeManager', {
    from: deployer.address,
    log: true,
    args: [fundDeployer.address] as FeeManagerArgs,
  });
};

fn.tags = ['Release', 'FeeManager'];
fn.dependencies = ['FundDeployer'];

export default fn;
