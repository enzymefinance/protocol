import {
  FundValueCalculatorUsdWrapperArgs,
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_YEAR_IN_SECONDS,
} from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const fundValueCalculatorRouter = await get('FundValueCalculatorRouter');

  const chainlinkStaleRateThreshold = hre.network.live
    ? ONE_DAY_IN_SECONDS + ONE_HOUR_IN_SECONDS
    : ONE_YEAR_IN_SECONDS * 10;

  await deploy('FundValueCalculatorUsdWrapper', {
    args: [
      fundValueCalculatorRouter.address,
      config.weth,
      config.chainlink.ethusd,
      chainlinkStaleRateThreshold,
    ] as FundValueCalculatorUsdWrapperArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Persistent', 'FundValueCalculatorUsdWrapper'];
fn.dependencies = ['Config', 'FundValueCalculatorRouter'];

export default fn;
