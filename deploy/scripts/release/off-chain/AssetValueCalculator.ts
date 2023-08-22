import { AssetValueCalculatorArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = (await hre.ethers.getSigners())[0];

  const valueInterpreter = await get('ValueInterpreter');

  await deploy('AssetValueCalculator', {
    args: [valueInterpreter.address] as AssetValueCalculatorArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'OffChain', 'AssetValueCalculator'];
fn.dependencies = ['ValueInterpreter'];

export default fn;
