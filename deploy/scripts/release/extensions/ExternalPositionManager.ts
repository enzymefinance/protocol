import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const aggregatedDerivativePriceFeed = await get('AggregatedDerivativePriceFeed');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');
  const compoundPriceFeed = await get('CompoundPriceFeed');
  const compoundDebtPositionLib = await get('CompoundDebtPositionLib');

  await deploy('ExternalPositionManager', {
    args: [
      aggregatedDerivativePriceFeed.address,
      chainlinkPriceFeed.address,
      config.weth,
      compoundPriceFeed.address,
      config.compound.comptroller,
      compoundDebtPositionLib.address,
    ],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ExternalPositionManager'];
fn.dependencies = [
  'Config',
  'AggregatedDerivativePriceFeed',
  'CompoundPriceFeed',
  'CompoundDebtPositionLib',
  'ChainlinkPriceFeed',
];

export default fn;
