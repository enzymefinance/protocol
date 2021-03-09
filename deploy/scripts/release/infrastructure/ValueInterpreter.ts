import { ValueInterpreterArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const aggregatedDerivativePriceFeed = await get('AggregatedDerivativePriceFeed');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');

  await deploy('ValueInterpreter', {
    args: [chainlinkPriceFeed.address, aggregatedDerivativePriceFeed.address] as ValueInterpreterArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ValueInterpreter'];
fn.dependencies = ['ChainlinkPriceFeed', 'AggregatedDerivativePriceFeed'];

export default fn;
