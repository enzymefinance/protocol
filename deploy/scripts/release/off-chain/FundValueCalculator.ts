import { FundValueCalculatorArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = (await hre.ethers.getSigners())[0];

  const feeManager = await get('FeeManager');
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('FundValueCalculator', {
    args: [feeManager.address, valueInterpreter.address] as FundValueCalculatorArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'OffChain', 'FundValueCalculator'];
fn.dependencies = ['FeeManager', 'ValueInterpreter'];

export default fn;
