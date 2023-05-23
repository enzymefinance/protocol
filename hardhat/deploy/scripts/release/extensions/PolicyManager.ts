import type { PolicyManagerArgs } from '@enzymefinance/protocol';
import { constants } from 'ethers';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, getOrNull },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const gasRelayPaymasterFactory = await getOrNull('GasRelayPaymasterFactory');

  await deploy('PolicyManager', {
    args: [fundDeployer.address, gasRelayPaymasterFactory?.address ?? constants.AddressZero] as PolicyManagerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'PolicyManager'];
fn.dependencies = ['FundDeployer', 'GasRelayPaymasterFactory'];

export default fn;
