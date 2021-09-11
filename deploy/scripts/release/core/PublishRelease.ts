import { Dispatcher, FundDeployer, ProtocolFeeTracker } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');
  const fundDeployer = await get('FundDeployer');
  const protocolFeeTracker = await get('ProtocolFeeTracker');

  const dispatcherInstance = new Dispatcher(dispatcher.address, deployer);
  await dispatcherInstance.setCurrentFundDeployer(fundDeployer.address);

  const fundDeployerInstance = new FundDeployer(fundDeployer.address, deployer);
  await fundDeployerInstance.setReleaseLive();

  const protocolFeeTrackerInstance = new ProtocolFeeTracker(protocolFeeTracker.address, deployer);
  await protocolFeeTrackerInstance.setFeeBpsDefault(50);
};

fn.tags = ['Release'];
// Include PostDeployment so the handoff gets run afterwards
fn.dependencies = ['Dispatcher', 'FundDeployer', 'PostDeployment', 'ProtocolFeeTracker'];
fn.runAtTheEnd = true;

// NOTE: On mainnet, this is part of the hand over / release routine.
fn.skip = async (hre) => hre.network.live;

export default fn;
