import type { PolicyManagerArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');

  await deploy('PolicyManager', {
    args: [fundDeployer.address] as PolicyManagerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'PolicyManager'];
fn.dependencies = ['FundDeployer'];

export default fn;
