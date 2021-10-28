import { FundValueCalculatorRouterArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');

  await deploy('FundValueCalculatorRouter', {
    args: [dispatcher.address] as FundValueCalculatorRouterArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'FundValueCalculatorRouter'];
fn.dependencies = ['Dispatcher'];

export default fn;
