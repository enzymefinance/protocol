import type { FundValueCalculatorRouterArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');

  await deploy('FundValueCalculatorRouter', {
    // TODO: update with all FundValueCalculator instances?
    args: [dispatcher.address, [], []] as FundValueCalculatorRouterArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'FundValueCalculatorRouter'];
fn.dependencies = ['Dispatcher'];

export default fn;
