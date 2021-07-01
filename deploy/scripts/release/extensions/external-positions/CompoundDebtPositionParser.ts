import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];

  const compoundPriceFeed = await get('CompoundPriceFeed');
  const aggregatedDerivativePriceFeed = await get('AggregatedDerivativePriceFeed');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');

  await deploy('CompoundDebtPositionParser', {
    args: [compoundPriceFeed.address, aggregatedDerivativePriceFeed.address, chainlinkPriceFeed.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'CompoundDebtPositionParser'];
fn.dependencies = ['Config', 'AggregatedDerivativePriceFeed', 'ChainlinkPriceFeed', 'CompoundPriceFeed'];
export default fn;
