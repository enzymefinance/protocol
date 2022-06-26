import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  await deploy('ArbitraryLoanPositionLib', {
    args: [config.weth],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ExternalPositions', 'ArbitraryLoanPositionLib'];
fn.dependencies = ['Config'];

export default fn;
