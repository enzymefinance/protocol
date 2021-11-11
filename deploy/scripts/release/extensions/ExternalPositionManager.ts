import { ExternalPositionFactory, ExternalPositionManager } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const compoundDebtPositionLib = await get('CompoundDebtPositionLib');
  const compoundDebtPositionParser = await get('CompoundDebtPositionParser');

  const uniswapV3ExternalPositionLib = await get('UniswapV3LiquidityPositionLib');
  const uniswapV3ExternalPositionParser = await get('UniswapV3LiquidityPositionParser');

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const externalPositionFactory = await get('ExternalPositionFactory');
  const policyManager = await get('PolicyManager');

  const externalPositionManager = await deploy('ExternalPositionManager', {
    args: [fundDeployer.address, externalPositionFactory.address, policyManager.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (externalPositionManager.newlyDeployed) {
    log('Updating ExternalPositionManager on ExternalPositionFactory');
    const externalPositionFactoryInstance = new ExternalPositionFactory(externalPositionFactory.address, deployer);

    await externalPositionFactoryInstance.addPositionDeployers([externalPositionManager]);
    await externalPositionFactoryInstance.addNewPositionTypes(['COMPOUND_DEBT', 'UNISWAP_V3_LIQUIDITY']);

    const externalPositionManagerInstance = new ExternalPositionManager(externalPositionManager.address, deployer);
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [0],
      [compoundDebtPositionLib],
      [compoundDebtPositionParser],
    );

    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [1],
      [uniswapV3ExternalPositionLib],
      [uniswapV3ExternalPositionParser],
    );
  }
};
fn.tags = ['Release', 'ExternalPositionManager'];
fn.dependencies = [
  'Config',
  'AggregatedDerivativePriceFeed',
  'CompoundDebtPositionLib',
  'CompoundDebtPositionParser',
  'ChainlinkPriceFeed',
  'ExternalPositionFactory',
  'PolicyManager',
  'UniswapV3LiquidityPositionLib',
  'UniswapV3LiquidityPositionParser',
];

export default fn;
