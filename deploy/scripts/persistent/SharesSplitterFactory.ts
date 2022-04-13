import type { SharesSplitterFactoryArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const globalConfigProxy = await get('GlobalConfigProxy');

  await deploy('SharesSplitterFactory', {
    args: [globalConfigProxy.address] as SharesSplitterFactoryArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'SharesSplitterFactory'];
fn.dependencies = ['GlobalConfig'];

export default fn;
