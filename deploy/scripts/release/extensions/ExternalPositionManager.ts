import { ExternalPositionManager } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const compoundDebtPositionLib = await get('CompoundDebtPositionLib');
  const compoundDebtPositionParser = await get('CompoundDebtPositionParser');
  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const policyManager = await get('PolicyManager');

  const externalPositionManager = await deploy('ExternalPositionManager', {
    args: [fundDeployer.address, policyManager.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const externalPositionManagerInstance = new ExternalPositionManager(externalPositionManager.address, deployer);
  await externalPositionManagerInstance.addTypesInfo([compoundDebtPositionLib], [compoundDebtPositionParser]);
};
fn.tags = ['Release', 'ExternalPositionManager'];
fn.dependencies = [
  'Config',
  'AggregatedDerivativePriceFeed',
  'CompoundDebtPositionLib',
  'CompoundDebtPositionParser',
  'ChainlinkPriceFeed',
  'PolicyManager',
];

export default fn;
