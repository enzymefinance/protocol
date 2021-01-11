import { DeployFunction } from 'hardhat-deploy/types';
import { FeeManager, FeeManagerArgs } from '@enzymefinance/protocol';
import { sameAddress } from '@crestproject/crestproject';

const fn: DeployFunction = async function (hre) {
  const { deploy, get, log } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');

  const feeManager = await get('FeeManager');

  const entranceRateBurnFee = await deploy('EntranceRateBurnFee', {
    from: deployer.address,
    log: true,
    args: [feeManager.address] as FeeManagerArgs,
  });

  const entranceRateDirectFee = await deploy('EntranceRateDirectFee', {
    from: deployer.address,
    log: true,
    args: [feeManager.address] as FeeManagerArgs,
  });

  const managementFee = await deploy('ManagementFee', {
    from: deployer.address,
    log: true,
    args: [feeManager.address] as FeeManagerArgs,
  });

  const performanceFee = await deploy('PerformanceFee', {
    from: deployer.address,
    log: true,
    args: [feeManager.address] as FeeManagerArgs,
  });

  // Register fees.
  const feeManagerInstance = new FeeManager(feeManager.address, deployer);
  const registeredPolicies = await feeManagerInstance.getRegisteredFees();
  const feesNeedingRegistration = [
    entranceRateBurnFee.address,
    entranceRateDirectFee.address,
    managementFee.address,
    performanceFee.address,
  ].filter((adapter) => !registeredPolicies.some((address) => sameAddress(adapter, address)));

  if (!!feesNeedingRegistration.length) {
    log('Registering new fees', feesNeedingRegistration);
    await feeManagerInstance.registerFees(feesNeedingRegistration);
  } else {
    log('Fees already registered');
  }
};

fn.tags = ['Release', 'Fees'];
fn.dependencies = ['FeeManager'];

export default fn;
