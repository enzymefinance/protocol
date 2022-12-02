import type { ProtocolFeeTrackerArgs } from '@enzymefinance/protocol';
import { FundDeployer as FundDeployerContract } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');

  const protocolFeeTracker = await deploy('ProtocolFeeTracker', {
    args: [fundDeployer.address] as ProtocolFeeTrackerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (protocolFeeTracker.newlyDeployed && !hre.network.live) {
    const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);

    log('Updating ProtocolFeeTracker on FundDeployer');
    await fundDeployerInstance.setProtocolFeeTracker(protocolFeeTracker.address);
  }
};

fn.tags = ['Release', 'ProtocolFeeTracker'];
fn.dependencies = ['FundDeployer'];

export default fn;
