import type { ValueInterpreterArgs } from '@enzymefinance/protocol';
import {
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_YEAR_IN_SECONDS,
  ValueInterpreter,
} from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');

  const chainlinkStaleRateThreshold = hre.network.live
    ? ONE_DAY_IN_SECONDS + ONE_HOUR_IN_SECONDS
    : ONE_YEAR_IN_SECONDS * 10;

  const valueInterpreter = await deploy('ValueInterpreter', {
    args: [fundDeployer.address, config.weth, chainlinkStaleRateThreshold] as ValueInterpreterArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (valueInterpreter.newlyDeployed) {
    const valueInterpreterInstance = new ValueInterpreter(valueInterpreter.address, deployer);
    await valueInterpreterInstance.setEthUsdAggregator(config.chainlink.ethusd);
  }
};

fn.tags = ['Release', 'ValueInterpreter'];
fn.dependencies = ['Config', 'FundDeployer'];

export default fn;
