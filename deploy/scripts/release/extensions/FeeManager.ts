import type { FeeManagerArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');

  await deploy('FeeManager', {
    args: [fundDeployer.address] as FeeManagerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'FeeManager'];
fn.dependencies = ['FundDeployer'];

export default fn;
