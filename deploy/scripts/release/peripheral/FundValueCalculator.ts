import { FundValueCalculatorArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const { deploy, get } = hre.deployments;
  const deployer = (await hre.ethers.getSigners())[0];

  const feeManager = await get('FeeManager');
  const protocolFeeTracker = await get('ProtocolFeeTracker');
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('FundValueCalculator', {
    args: [feeManager.address, protocolFeeTracker.address, valueInterpreter.address] as FundValueCalculatorArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Peripheral', 'FundValueCalculator'];
fn.dependencies = ['FeeManager', 'ProtocolFeeTracker', 'ValueInterpreter'];

export default fn;
